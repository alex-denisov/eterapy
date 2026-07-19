# RU HA: PostgreSQL streaming replica eterapy-1 → eterapy-2 (B537)

Состояние на 2026-07-19: **реплика работает**, лаг ~0. Промоут ОТРЕПЕТИРОВАН
(изолированно, без переключения трафика): promote 0.22 с, failback-пересборка
~1 мин — процедура ниже. Учение потери целой ВМ пройдено дважды (жёсткий
ребут и полный power-off через API `set-power`). Не пройдено: двустороннее
failover-учение с owner (потеря primary + реальное переключение трафика).

## Топология

| | eterapy-1 | eterapy-2 |
|---|---|---|
| роль | primary (пишущий) | hot standby (read-only) |
| публичный IP | 192.144.14.146 | 192.144.13.153 |
| адрес в туннеле | 10.77.0.1 | 10.77.0.2 |
| PostgreSQL | 16.14, **нативный** пакет Ubuntu | 16.14, **контейнер** `eterapy-db-1` |
| конфиги PG | `/etc/postgresql/16/main/` | внутри данных, том `eterapy_pgdata` |
| слот репликации | `eterapy2` | — |
| worker | работает | **остановлен намеренно** (см. ниже) |

Оба узла — РФ-контур. ПДн РФ за пределы контура не уезжают (152-ФЗ):
eterapy-3 (US) и eterapy-4 (EU) в репликации **не участвуют**.

## Транспорт: WireGuard, а не открытый 5432

На хостах правил нет (`iptables -P INPUT ACCEPT`, правил ноль, `ufw inactive`)
— **и это норма, а не поломка**: у cloud.ru и AWS фильтрация живёт в консоли
управления (security groups), а не на ВМ. Не «чините» пустой `iptables` на
ноде: рискуете потерять SSH, ничего не выиграв. Проба снаружи — на всех 4
нодах открыты только 22/80/443, порты 5432/3200/6379 недоступны. Остатки по
теме (в т.ч. eterapy-3 на RackNerd, где консольного фаервола нет) — PRB-009.

Postgres на публичный IP всё равно не выставляли: правило пришлось бы держать
в чужой консоли, а порт торчал бы наружу до первой ошибки в security group.
Вместо этого поднят туннель:

- юнит `wg-quick@wg-fleet` на обоих узлах (`systemctl enable` — переживает ребут);
- конфиг `/etc/wireguard/wg-fleet.conf`, ключи `/etc/wireguard/{privatekey,publickey}`;
- сеть `10.77.0.0/24`, UDP 51820, RTT ~0.9 мс;
- Postgres на eterapy-1 слушает **только** `localhost` и `10.77.0.1` —
  проверяется `ss -ltnp "sport = :5432"`, публичного сокета быть не должно;
- `pg_hba.conf` пускает `replication` только с `10.77.0.2/32`.

Трафик репликации шифрует WireGuard, поэтому TLS поверх него не включён
(`sslmode` в `primary_conninfo` не задан).

Туннель переиспользуем: B540 (geo-роутер) и B542 (LiveKit/Redis mesh) должны
ходить между нодами через него, а не через публичные адреса.

## Грабли, на которые уже наступили

1. **Конфигов нет в дампе.** eterapy-1 — Debian-пакет, конфиги в
   `/etc/postgresql/`, а `pg_basebackup` копирует только каталог данных.
   Образ `postgres:16` ждёт `postgresql.conf` внутри данных → контейнер
   уходил в рестарт-луп. Конфиг standby написан руками; значения
   `max_connections` / `max_worker_processes` / `max_locks_per_transaction` /
   `max_prepared_transactions` **обязаны быть ≥ primary** — они зеркалированы.
   При изменении этих параметров на primary их надо поднять и на standby.
2. **`pg_basebackup -R` пишет `sslnegotiation`**, который сервер того же
   образа не понимает → `FATAL: invalid connection string syntax`.
   `primary_conninfo` перезаписан вручную.
3. **Пароли после basebackup — от primary.** Реплика несёт роли eterapy-1,
   поэтому старый локальный пароль eterapy-2 перестал подходить (`P1000`).
   `DATABASE_URL` на eterapy-2 теперь несёт креды eterapy-1 при хосте
   `db:5432` — именно поэтому промоут не требует правки конфига приложения.
4. **worker не живёт на standby.** Он пишет при каждом тике (`job.create`),
   реплика read-only → крэш-луп. Контейнер остановлен, `--restart=no`.

## Деплой на standby (закрыто кодом, но ветка ещё не смёржена)

`deploy/compose/docker-compose.yml` (по нему разливаются eterapy-2/3/4) в
исходном виде уводил бы standby в красное на первом же прод-деплое: `migrate`
выполнял `prisma migrate deploy` (на read-only реплике падает, а `web` ждёт
его через `service_completed_successfully` и не поднимается), `worker` с
`restart: always` уходил в крэш-луп.

Сейчас:

1. `migrate` пропускает миграции при `FLEET_NODE_STANDBY=1` и выходит `0`
   (маркер проставлен в `/opt/eterapy/.env` на eterapy-2; деплой проставляет
   его сам из флага `standby` в `deploy/fleet-matrix.json`). Схему на реплику
   приносит сама репликация.
2. `worker` уведён за профиль `worker`; профиль получают только узлы с пишущей
   БД. На standby он стартует шагом промоута.
3. Тест-гарды: `web/src/__tests__/b537-standby-deploy-guard.test.ts`.

(Исторично: гейты жили в ветке `claude/b537-ru-pg-replica`; на 2026-07-19
они в `main` и стерегутся `b537-standby-deploy-guard.test.ts` — прод-деплои
eterapy-2 зелёные.)

## Промоут (failover eterapy-1 → eterapy-2)

Отрепетировано 2026-07-19 (изолированно). Порядок:

```bash
# 1. убедиться, что primary действительно мёртв (иначе split-brain)
ssh admin@192.144.14.146 'sudo -u postgres psql -Atc "select 1"'   # должно НЕ ответить

# 2. промоут реплики
# ⚠ обязательно -u postgres: под root pg_ctl откажется
ssh admin@192.144.13.153 'sudo docker exec -u postgres eterapy-db-1 pg_ctl promote -D /var/lib/postgresql/data'
ssh admin@192.144.13.153 'sudo docker exec eterapy-db-1 psql -U postgres -Atc "select pg_is_in_recovery()"'  # ждём f

# 3. поднять worker (на standby он намеренно выключен)
ssh admin@192.144.13.153 'cd /opt/eterapy && sudo docker update --restart=always eterapy-worker-1 && sudo docker start eterapy-worker-1'

# 4. переключить трафик: A-записи app/www/admin на 192.144.13.153 (Cloudflare API)
```

`DATABASE_URL` менять **не нужно** — приложение уже смотрит на локальную БД
кредами eterapy-1.

Сессии переживают failover: JWT + единый `AUTH_SECRET` на обоих узлах.
Рвутся: LiveKit-сессии и in-memory rate-limit (ожидаемо, зафиксировано в B537).

### Failback / пересборка standby (отрепетировано 2026-07-19)

Диверженный после промоута каталог в standby не возвращается — только
пересборка. На БД текущего размера весь цикл ~1 мин (basebackup 6 с):

```bash
# 0. сохранить конфиги ДО очистки (их нет в basebackup — грабля №1)
sudo docker run --rm -v eterapy_pgdata:/v -v /root/b537-rehearsal:/b alpine   sh -c 'cp /v/postgresql.conf /v/pg_hba.conf /v/postgresql.auto.conf /b/'

# 1. стоп + архив старого каталога + очистка тома
sudo docker stop eterapy-db-1
sudo docker run --rm -v eterapy_pgdata:/v -v /root/b537-rehearsal:/b alpine   sh -c 'tar czf /b/pgdata-old.tar.gz -C /v . && find /v -mindepth 1 -delete'

# 2. basebackup с primary по WG (пароль replicator — в сохранённом auto.conf)
PASS=$(sudo grep -o 'password=[^ ]*' /root/b537-rehearsal/postgresql.auto.conf | cut -d= -f2)
IMG=$(sudo docker inspect -f '{{.Config.Image}}' eterapy-db-1)
sudo docker run --rm -v eterapy_pgdata:/var/lib/postgresql/data   -e PGPASSWORD="$PASS" --network host "$IMG"   pg_basebackup -h 10.77.0.1 -U replicator -D /var/lib/postgresql/data   -X stream -S eterapy2 --no-password

# 3. вернуть конфиги (auto.conf свой — обходит граблю sslnegotiation из -R),
#    standby.signal, права; старт
sudo docker run --rm -v eterapy_pgdata:/v -v /root/b537-rehearsal:/b alpine   sh -c 'cp /b/postgresql.conf /b/pg_hba.conf /b/postgresql.auto.conf /v/     && touch /v/standby.signal && chown -R 999:999 /v'
sudo docker start eterapy-db-1

# 4. проверка: streaming + лаг 0 + слот active на primary
sudo docker exec eterapy-db-1 psql -U postgres -Atc   'select status, slot_name from pg_stat_wal_receiver'
sudo docker exec eterapy-db-1 psql -U postgres -Atc   'select pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()'
```

Тот же рецепт перезаливает бывший primary после настоящего failover —
только хост в `pg_basebackup` будет 10.77.0.2 (новый primary), и на
eterapy-1 PG нативный (не контейнер): пути/юниты соответственно.

## Панель мониторинга

Секция «Репликация PG» в раскрытии строки ноды на `/admin/ops/monitoring`
(только SUPERADMIN). Данные собирает host-коллектор
`deploy/agent/collect-node-state.sh`, приложение к БД соседа не ходит.

- **primary** — список подключённых реплик, состояние и отставание в байтах.
  Пустой список при существующем слоте — красным: слот держит WAL.
- **standby** — статус потока и отставание в секундах (порог 30 с → жёлтый,
  300 с → красный; репликация async, секунды это норма).
- Ноды без слотов (eterapy-3/4) секцию не показывают вовсе — у них
  репликации нет и не задумывалось.

⚠ Считать лаг standby «в лоб» через `now() - pg_last_xact_replay_timestamp()`
**нельзя**: на простое primary эта величина растёт, хотя реплика догнана.
Коллектор сперва сверяет `pg_last_wal_receive_lsn()` и
`pg_last_wal_replay_lsn()` — равны, значит отставание ноль.

## Проверка «всё ли живо»

```bash
# на primary — есть ли подключённая реплика и какой лаг
ssh admin@192.144.14.146 'sudo -u postgres psql -x -c \
  "select application_name, client_addr, state, sync_state, replay_lag from pg_stat_replication"'

# на standby — идёт ли поток
ssh admin@192.144.13.153 'sudo docker exec eterapy-db-1 psql -U postgres -Atc \
  "select status, sender_host, slot_name from pg_stat_wal_receiver"'

# туннель
ssh admin@192.144.14.146 'sudo wg show wg-fleet'
```

Признак беды: `pg_replication_slots.active = false` на primary дольше пары
минут — реплика отвалилась, а WAL начинает копиться на primary (слот держит
сегменты). Диск primary при затяжном отвале может кончиться — это плата за
слот, следить.

## Секреты

Пароль роли `replicator` лежит в `primary_conninfo` внутри
`postgresql.auto.conf` на eterapy-2 (0600, uid 999) и продублирован в
`~/.eterapy/infra-credentials.env` у owner. В репозитории его нет.
