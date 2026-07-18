# B541 — «Мониторинг флота» в суперадминке

Раздел `/admin/ops/monitoring` (только SUPERADMIN) показывает состояние всех ВМ
и запускает редеплой ноды или всего флота в один клик — без SSH.

## Как это устроено

| Слой | Где живёт |
|---|---|
| Инвентарь для деплой-матрицы | `deploy/fleet-matrix.json` (в репозитории) |
| Инвентарь для панели | `FLEET_NODES` в `/opt/eterapy/.env` (адреса — только на хосте) |
| Агент на ноде | `GET /api/ops/node-status`, заголовок `x-ops-secret` |
| Запуск деплоя | GitHub `workflow_dispatch` → `deploy.yml` с input `nodes` |
| Аудит | `audit_logs`, действия `FLEET_DEPLOY` / `FLEET_DEPLOY_FAILED` |

`deploy.yml` больше не хранит матрицу инлайном: job `plan` читает
`deploy/fleet-matrix.json` и фильтрует его по input `nodes` (`all` или
`eterapy-1,eterapy-4`). Значение input никогда не подставляется в shell —
только в env-переменную, которую сравнивает `jq` с фиксированным списком slug'ов.

## Переменные окружения (все — в `/opt/eterapy/.env`, НЕ в репозитории)

Задаются **на ноде, где стоит админка** (eterapy-1):

```env
# Инвентарь: что показывать в панели
FLEET_NODES='[
  {"name":"eterapy-1","host":"192.144.14.146","role":"primary","contour":"ru"},
  {"name":"eterapy-2","host":"192.144.13.153","role":"standby","contour":"ru"},
  {"name":"eterapy-3","host":"107.172.153.202","role":"edge","contour":"foreign"},
  {"name":"eterapy-4","host":"18.195.184.182","role":"edge","contour":"foreign"}
]'

# Секрет агент-эндпоинта (если не задан — используется CRON_SECRET)
FLEET_OPS_SECRET=<длинная случайная строка>

# Fine-grained PAT с actions:write на репозиторий — только для redeploy-кнопок
FLEET_GITHUB_TOKEN=github_pat_...
FLEET_GITHUB_REPO=alex-denisov/eterapy   # по умолчанию
FLEET_DEPLOY_REF=main                    # по умолчанию
FLEET_DEPLOY_WORKFLOW=deploy.yml         # по умолчанию
```

Задаются **на каждой ноде** (одинаковый `FLEET_OPS_SECRET`):

```env
FLEET_OPS_SECRET=<тот же секрет>
FLEET_NODE_NAME=eterapy-2   # проставляется деплоем автоматически
```

`ETERAPY_IMAGE` деплой уже пишет сам — из его тега панель читает релиз-SHA.

## Безопасность

- Панель доступна только роли `SUPERADMIN` (`ADMIN` её не видит).
- `x-ops-secret` сравнивается за постоянное время; секрет идёт заголовком,
  а не в URL (URL попадает в логи nginx и в историю раннера).
- `FLEET_GITHUB_TOKEN` никогда не выводится в UI: текст ошибки GitHub
  редактируется перед показом.
- Редеплой возможен только на ноду из инвентаря — имя из формы валидируется.
- Порт `:3200` нод не должен быть открыт в интернет: агент-эндпоинт рассчитан
  на приватную сеть флота. Если ноды общаются через публичные адреса, ограничьте
  `:3200` файрволом до IP eterapy-1.

## Проверка

```bash
# на ноде
curl -s -H "x-ops-secret: $FLEET_OPS_SECRET" http://127.0.0.1:3200/api/ops/node-status | jq

# без секрета → 401
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3200/api/ops/node-status
```

## Ограничения (осознанные)

- Статус контейнеров через docker-socket не читается — сокет в контейнер
  намеренно не пробрасывается. Вместо этого отдаются readiness-проверки
  приложения (БД и зависимости) + диск/память хоста.
- Лаг реплики появится вместе с B537 (streaming replica) — сейчас реплики нет.
