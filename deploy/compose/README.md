# B473 — container-стек eterapy (тестовая ВМ и будущие ВМ)

Модель сетевого периметра и разрешённые публичные порты для каждой production
ноды зафиксированы в [`../SECURITY-PERIMETER.md`](../SECURITY-PERIMETER.md).
Production workflow после каждого релиза снаружи проверяет, что служебные
`5432/3200/6379/7880` не стали публичными.

Одна ВМ = один каталог `/opt/eterapy` с тремя артефактами:

| Файл | Что это |
| --- | --- |
| `.env` | **Единственный файл переменных**: образ-релиз, домен, БД, все секреты приложения |
| `docker-compose.yml` | Стек: web, worker, Postgres 16, Caddy (авто-TLS), миграции, ежедневный pg_dump |
| `Caddyfile` | Реверс-прокси; адрес сайта берётся из `.env` (`CADDY_SITE_ADDRESS`) |

## С нуля (после переустановки ОС)

```bash
scp -r deploy/compose root@VM:/opt/eterapy-bootstrap
ssh root@VM 'bash /opt/eterapy-bootstrap/bootstrap.sh'
# затем один запуск workflow «Deploy Test VM» (Actions) — он собирает образ,
# доставляет его на ВМ (docker save | ssh docker load) и поднимает стек.
```

`bootstrap.sh` идемпотентен: ставит docker при отсутствии, генерирует свежие
секреты в `.env` (только при первом запуске), авторизует ключ CI.

## Релиз / откат

- Релиз: workflow «Deploy Test VM» → образ `eterapy-web:<sha>` пинуется в `.env`.
- Откат: `sed -i 's/^ETERAPY_IMAGE=.*/ETERAPY_IMAGE=eterapy-web:<старый sha>/' /opt/eterapy/.env && docker compose up -d` — секунды, образ уже на диске.

## Смена домена

`NEXT_PUBLIC_*` зашиваются в клиентский бандл при сборке образа → смена домена
= запуск workflow с новыми inputs (`main_domain`, `public_url`,
`use_subdomains`) + правка `CADDY_SITE_ADDRESS`/`NEXTAUTH_URL` в `.env`.
Остальные переменные меняются правкой `.env` + `docker compose up -d`.

## RPO / бэкапы

Сервис `backup` делает ежедневный `pg_dump -Fc` в `/opt/eterapy/backups`
(хранит `ETERAPY_BACKUP_KEEP`, по умолчанию 14). Для настоящего RPO копируйте
каталог оффхост (rsync-крон или объектное хранилище).

## Почему не Terraform/Ansible

- Terraform управляет облачным API — здесь его нет (две статические VPS).
- Роль Ansible (сойтись к состоянию) выполняют образ + compose: состояние ВМ
  = «docker + один каталог», всё остальное внутри неизменяемого образа.
- Сборка происходит в CI (4 vCPU), ВМ 1 vCPU только запускает готовое —
  деплой/откат за секунды, переустановка ОС восстанавливается одним скриптом.
