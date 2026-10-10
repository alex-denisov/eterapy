# eterapy-docs — контракт агентов, тикеты, доска, журнал

Приватное зеркало каталога `docs/` и корневых файлов-контрактов проекта
[`alex-denisov/eterapy`](https://github.com/alex-denisov/eterapy), которые в
основном (публичном) репозитории намеренно в `.gitignore` (решение B340).
Заведён владельцем 2026-09-13, чтобы **облачные сессии** Claude Code видели
агентский контракт и могли вести трек задач.

## Что здесь есть

| Путь | Что это |
|---|---|
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `QWEN.md`, `ZCODE.md` | контракт агента — читать ПЕРВЫМ |
| `docs/agents/` | правила: жизненный цикл задачи, деплой, проверки |
| `docs/v5-release/tasks/BOARD.md` | **доска — только открытая работа** |
| `docs/v5-release/tasks/tickets/` | тикет-на-файл (`B###-*.md`) |
| `docs/v5-release/JOURNAL.md` | журнал батчей и выкаток |
| `DEPLOY.md`, `docs/v5-release/ops/` | как устроена выкатка |
| `.claude/agents/` | роли агентов разработки (CPO и штат, B748) — порядок работы в `docs/agents/org/README.md` |
| `docs/ETerapy_v5_Product_Package/`, `PRODUCT.md`, `DESIGN.*` | продукт и дизайн — источник истины для BA/дизайнера |

Чего здесь **нет и не будет**: секретов. `infra-credentials.env`, ключи SSH,
сертификаты живут у владельца в `~/.eterapy/` и в GitHub Secrets основного
репозитория; на прод они доезжают только выкаткой.

## Как этим пользоваться в облачной сессии

```bash
git clone https://github.com/alex-denisov/eterapy-docs.git ../eterapy-docs
```

Дальше — по `../eterapy-docs/AGENTS.md`. Тикеты и доску править **здесь** и
пушить в `main` этого репозитория; код — в `eterapy`. Ссылки внутри доков
относительные и рассчитаны на раскладку `docs/…` рядом с корневыми файлами,
поэтому в облаке репозиторий кладите рядом с кодом, а не внутрь него.

## Роли агентов в облачной сессии

> **Только для облачной сессии.** На локальной машине владельца роли уже
> лежат в `~/Projects/eterapy/.claude/agents/`: зеркало — это второй git-dir
> поверх той же папки, каталога `../eterapy-docs` локально нет, и команда ниже
> там упадёт с `no matches found`.

Главная сессия — CPO (`docs/agents/org/README.md`), роли лежат в
`.claude/agents/` этого репозитория. Чтобы облачная сессия в `eterapy`
вызывала их по имени, скопируйте роли до старта сессии:

```bash
mkdir -p .claude/agents && cp ../eterapy-docs/.claude/agents/*.md .claude/agents/
```

Роли подхватываются при старте сессии. Если копия сделана уже внутри
сессии, CPO вызывает роль через `general-purpose` с текстом её файла в задании.

## Как это синхронизируется с локальной машиной владельца

Локально каталог один — `~/Projects/eterapy`; у него два git-dir: основной
(`.git`, код) и `~/.eterapy/eterapy-docs.git` (этот репозиторий), у которого
`core.worktree` указывает на тот же каталог. Отправка: `~/.eterapy/eterapy-docs-sync.sh`.
Подтянуть правки облака: `git --git-dir=$HOME/.eterapy/eterapy-docs.git --work-tree=$HOME/Projects/eterapy pull origin main`.
