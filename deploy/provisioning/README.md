# B538 — добавление ВМ во флит (автопровижининг)

Инвентарь флита — **`deploy/fleet-matrix.json`** (единственный источник
истины: его читают деплой-matrix в `deploy.yml` и панель мониторинга B541).
Новая ВМ «встраивается в архитектуру» декларативно: запись в инвентаре +
bootstrap; дальше каждый push в `main` раскатывает её вместе со всеми.

## Как добавить ВМ (5 шагов)

1. **Создать ВМ у провайдера** (Ubuntu 22.04/24.04, ≥2 GB RAM; строго
   НЕ собирать на ней образы — сборка только в CI).
2. **Bootstrap** (ставит docker, swap, раскладку /opt/eterapy, авторизует
   CI-ключ из `deploy/compose/ci_authorized_key.pub`, генерит локальные
   секреты .env):
   ```bash
   scp -r deploy root@VM:/opt/eterapy-bootstrap
   ssh root@VM 'bash /opt/eterapy-bootstrap/compose/bootstrap.sh'
   ```
   На панельных провайдерах без внешнего файрвола (RackNerd) — включить
   внутренний: `BOOTSTRAP_UFW=1 bash …/bootstrap.sh` (откроет 22/80/443;
   доп. порты — `BOOTSTRAP_UFW_EXTRA="7881/tcp 50000:50100/udp"`).
3. **Общие секреты** доставить один раз оператором (scp значений
   AUTH_SECRET / ключей провайдеров в `/opt/eterapy/.env`) — они общие на
   контур и в git не живут.
4. **Запись в `deploy/fleet-matrix.json`**: `{name, slug, host, user,
   compose, profile_args, standby}`. Роли через `profile_args`
   (`--profile worker`, `-f docker-compose.livekit.yml --profile livekit`,
   …); `standby: true` = нода с read-only репликой (гасит migrate/worker).
5. **Push в `main`** (или кнопка редеплоя ноды в /admin/ops/monitoring) —
   CI построит образ, зальёт по SSH и сконверджит стек; health ноды виден
   в fleet-health деплоя и панели мониторинга.

## Пути по провайдерам

| Провайдер | Файрвол | Создание ВМ |
|---|---|---|
| cloud.ru (VDS, acc1/acc2) | на хостах файрвола нет; межнодовое — WireGuard | консоль (API — см. ниже) |
| RackNerd (панель SolusVM) | только внутри ВМ → `BOOTSTRAP_UFW=1` | консоль |
| AWS EC2 | Security Groups (нужен рабочий AKIA — на 2026-07-19 ❌) | консоль/API |

## API cloud.ru — полный lifecycle ЕСТЬ (исправлено 2026-07-19)

Ранний вывод «у cloud.ru нет create/power-эндпоинтов» был ОШИБОЧЕН —
угадывались не те пути. Официальная OpenAPI-спека сервиса «Виртуальные
машины» (https://cloud.ru/docs/virtual-machines/ug/topics/api-ref, YAML
по ссылке «Спецификация OpenAPI») документирует на `compute.api.cloud.ru`:

- `POST /api/v1.1/vms` — **создание ВМ** (v1 create помечен устаревшим);
- `POST /api/v1/vms/{vm_id}/set-power` — **питание**: `power_on` /
  `power_off` / `reboot`;
- `DELETE /api/v1/vms/{vm_id}`, `/rebuild`, `/get-vnc`, `/remote-console`;
- security-groups (+rules), disks (+attach/detach/reimage), subnets,
  images, interfaces, flavors, availability-zones, tasks.

Проверено живьём 2026-07-19 (IAM-токен `POST iam.api.cloud.ru/api/v1/auth/token`):
`set-power` с валидным телом и несуществующим UUID → **422** (маршрут
существует, вход валидируется), `POST /api/v1.1/vms` с пустым телом → **422**.
Прошлые 405/404 — это `POST {id}:stop` и прочие угаданные пути, которых в
спеке нет.

Следствия: Terraform-слой (или тонкая обвязка над REST) для cloud.ru
**разблокирован** — create+SG+power+delete покрывают DoD B538; state — в
приватный bucket cloud.ru S3 (как у B536). Учение B537 «стоп целой ВМ через
API» тоже возможно: `set-power power_off` → `power_on`.

До появления этого слоя действует ручной путь: шаги 1–5 выше (создание ВМ в
консоли + одна доставка секретов; остальное делает CI от инвентаря).
