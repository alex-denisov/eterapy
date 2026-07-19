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

## Terraform для cloud.ru — статус 2026-07-19

Terraform-слой здесь имел бы смысл только для lifecycle-операций через API
провайдера. Проверено живьём (см. HANDOFF-2026-07-19): у
`compute.api.cloud.ru/api/v1/vms` есть **list / get / PUT(метаданные) /
DELETE**, но **нет** create- и power-эндпоинтов (`POST {id}:stop` → 405, все
угаданные пути → 404, в открытой документации отсутствуют; IAM-токен через
`POST iam.api.cloud.ru/api/v1/auth/token` работает). Управлять жизненным
циклом ВМ из Terraform нечем → полноценный `terraform apply/destroy` для
этих аккаунтов **заблокирован до ответа поддержки cloud.ru** (вопрос
у owner). Когда/если появится API (или переезд на Evolution-платформу с её
официальным Terraform-провайдером `cloudru`), слой добавляется сюда,
state — в приватный bucket (cloud.ru S3, как у B536).

До тех пор фактический «провижининг» = шаги 1–5 выше: единственные ручные
действия — создание ВМ в консоли и одна доставка секретов; всё остальное
делает CI от инвентаря.
