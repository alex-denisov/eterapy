# RU HA: PostgreSQL streaming replica eterapy-1 → eterapy-2 (B537)

Состояние на 2026-07-18: **реплика работает**, лаг ~0, промоут отрепетирован
не был (учение с owner — отдельный шаг B537).

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

На хостах **нет файрвола вообще** (`iptables -P INPUT ACCEPT`, правил ноль).
Поэтому `listen_addresses` на публичный IP означал бы прод-Postgres в открытом
интернете. Вместо этого поднят туннель:

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

⚠ Всё это живёт в ветке **`claude/b537-ru-pg-replica`**. Пока она не в `main`,
прод-деплой пойдёт по старому compose — на ноду новый файл положен руками,
но пайплайн перезапишет его. **Мержить до следующего прод-деплоя.**

## Промоут (failover eterapy-1 → eterapy-2)

Не отрепетировано с owner. Порядок:

```bash
# 1. убедиться, что primary действительно мёртв (иначе split-brain)
ssh admin@192.144.14.146 'sudo -u postgres psql -Atc "select 1"'   # должно НЕ ответить

# 2. промоут реплики
ssh admin@192.144.13.153 'sudo docker exec eterapy-db-1 pg_ctl promote -D /var/lib/postgresql/data'
ssh admin@192.144.13.153 'sudo docker exec eterapy-db-1 psql -U postgres -Atc "select pg_is_in_recovery()"'  # ждём f

# 3. поднять worker (на standby он намеренно выключен)
ssh admin@192.144.13.153 'cd /opt/eterapy && sudo docker update --restart=always eterapy-worker-1 && sudo docker start eterapy-worker-1'

# 4. переключить трафик: A-записи app/www/admin на 192.144.13.153 (Cloudflare API)
```

`DATABASE_URL` менять **не нужно** — приложение уже смотрит на локальную БД
кредами eterapy-1.

Сессии переживают failover: JWT + единый `AUTH_SECRET` на обоих узлах.
Рвутся: LiveKit-сессии и in-memory rate-limit (ожидаемо, зафиксировано в B537).

### Failback

Обратно «как было» автоматически не собирается: бывший primary после
промоута реплики отстаёт и его надо перезаливать `pg_basebackup` уже с
eterapy-2. Отдельная процедура, писать при учении.

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
