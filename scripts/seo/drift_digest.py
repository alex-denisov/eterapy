#!/usr/bin/env python3
"""
B641 — сводка сторожа поисковой разметки для человека.

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Первая версия отчёта (B639) отправляла в Telegram первые
1500 символов файла находок: полный URL, под ним до четырёх строк вида
`CRITICAL: Title changed from … to …`, и так по каждому адресу, пока не кончится
лимит. При 205 адресах в карте это не читается, и главное — по такому тексту
нельзя понять, ЧТО случилось: одно и то же расхождение на сорока страницах
выглядит как сорок разных проблем.

Здесь находки группируются ПО ПРАВИЛУ, а не по адресу. «Сменился canonical —
3 адреса» — это одно событие и одно решение. Адреса печатаются путями: домен у
всех один, и он занимает четверть строки на телефоне.

Вход — JSON на stdin (см. `--format` ниже), выход — готовый текст.
Формат `telegram` рассчитан на отправку БЕЗ parse_mode: любая разметка требует
экранирования, а в наших находках встречаются и `<`, и `&`, и `_`.
"""

import argparse
import json
import sys
from urllib.parse import urlsplit

# Слаг правила владельцу ничего не говорит: `noindex_added` в сообщении — это
# просьба сходить в исходники. Порядок — тяжесть, затем частота.
RULE_LABELS = {
    "status_code_error": "страница отвечает ошибкой",
    "noindex_added": "появился запрет индексации",
    "canonical_removed": "исчез canonical",
    "canonical_changed": "сменился canonical",
    "title_removed": "исчез заголовок title",
    "title_changed": "сменился заголовок title",
    "h1_removed": "исчез H1",
    "h1_changed": "сменился H1",
    "meta_description_changed": "сменилось описание",
    "og_tags_removed": "исчезли OG-теги",
    "schema_removed": "исчезла разметка Schema",
    "schema_modified": "изменилась разметка Schema",
    "schema_added": "добавилась разметка Schema",
    "h2_structure_changed": "изменилась структура H2",
    "content_hash_changed": "изменился текст страницы",
    "cwv_regressed": "просели Core Web Vitals",
    "perf_score_dropped": "упала оценка скорости",
}

SEVERITY_ICON = {"CRITICAL": "🔴", "WARNING": "🟡"}
SEVERITY_ORDER = {"CRITICAL": 0, "WARNING": 1}

# Пределы подобраны под телефон: длинное сообщение читают ровно так же, как не
# читают вовсе. Полный список всегда лежит в сводке прогона GitHub.
MAX_GROUPS = 8
MAX_PATHS_PER_GROUP = 3
MAX_TELEGRAM_CHARS = 1200


def path_of(url: str) -> str:
    """Путь без домена. Домен у всех адресов один и в сообщении не нужен."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    if not parts.netloc:
        return url
    return (parts.path or "/") + (f"?{parts.query}" if parts.query else "")


def group_findings(pages: list) -> list:
    """
    Свернуть находки по паре (правило, тяжесть).

    `pages` — список `{"url": ..., "findings": [{"rule", "severity", ...}]}`.
    Один адрес может дать несколько находок по одному правилу (разные поля) —
    адрес в группе всё равно учитывается один раз, иначе счётчик «адресов»
    перестаёт быть счётчиком адресов.
    """
    groups: dict[tuple[str, str], dict] = {}
    for page in pages:
        url = page.get("url") or ""
        for finding in page.get("findings") or []:
            severity = finding.get("severity")
            if severity not in SEVERITY_ICON:
                continue
            key = (finding.get("rule") or "unknown", severity)
            group = groups.setdefault(key, {"rule": key[0], "severity": severity, "urls": []})
            if url not in group["urls"]:
                group["urls"].append(url)
    return sorted(
        groups.values(),
        key=lambda g: (SEVERITY_ORDER[g["severity"]], -len(g["urls"]), g["rule"]),
    )


def plural_addresses(count: int) -> str:
    """«1 адрес», «2 адреса», «5 адресов» — иначе отчёт читается как машинный."""
    tail = count % 100
    if 11 <= tail <= 14:
        return f"{count} адресов"
    last = count % 10
    if last == 1:
        return f"{count} адрес"
    if 2 <= last <= 4:
        return f"{count} адреса"
    return f"{count} адресов"


def _group_line(group: dict) -> str:
    label = RULE_LABELS.get(group["rule"], group["rule"])
    urls = group["urls"]
    head = f"{SEVERITY_ICON[group['severity']]} {label} — {plural_addresses(len(urls))}"
    shown = [path_of(url) for url in urls[:MAX_PATHS_PER_GROUP]]
    rest = len(urls) - len(shown)
    tail = ", ".join(shown) + (f" +{rest}" if rest > 0 else "")
    return f"{head}\n   {tail}"


def telegram_text(report: dict) -> str:
    pages = report.get("pages") or []
    groups = group_findings(pages)
    checked = report.get("checked", 0)
    errors = report.get("errors") or []

    lines = [f"🔎 SEO после выкатки · {report.get('urls_total', checked)} адресов"]
    lines.append(f"IndexNow: {report.get('indexnow') or '—'}")

    status = f"Разметка: сверено {checked}"
    if groups:
        status += f" · расхождения на {len(pages)}"
    else:
        status += " · всё совпало"
    if errors:
        status += f" · не сверено {len(errors)}"
    lines.append(status)

    if groups:
        lines.append("")
        for group in groups[:MAX_GROUPS]:
            lines.append(_group_line(group))
        hidden = len(groups) - MAX_GROUPS
        if hidden > 0:
            lines.append(f"…и ещё {hidden} видов расхождений — в сводке прогона")

    text = "\n".join(lines)
    if len(text) > MAX_TELEGRAM_CHARS:
        # Обрезка обязана сказать, что она обрезка: молча укороченный отчёт
        # читается как полный и врёт ровно в ту сторону, куда не надо.
        text = text[: MAX_TELEGRAM_CHARS - 40].rstrip() + "\n… отчёт сокращён, полный — в сводке прогона"
    return text


def summary_markdown(report: dict) -> str:
    """Полная картина для сводки прогона GitHub: здесь длина не мешает."""
    pages = report.get("pages") or []
    groups = group_findings(pages)
    errors = report.get("errors") or []
    out = ["## 🔎 Сторож поисковой разметки", ""]
    out.append(f"- Адресов в карте: **{report.get('urls_total', 0)}**")
    out.append(f"- Сверено: **{report.get('checked', 0)}**")
    out.append(f"- Адресов с расхождениями: **{len(pages)}**")
    out.append(f"- Не сверено: **{len(errors)}**")
    out.append(f"- IndexNow: {report.get('indexnow') or '—'}")

    if groups:
        out += ["", "### Расхождения", ""]
        for group in groups:
            label = RULE_LABELS.get(group["rule"], group["rule"])
            out.append(
                f"<details><summary>{SEVERITY_ICON[group['severity']]} {label} — "
                f"{plural_addresses(len(group['urls']))}</summary>"
            )
            out.append("")
            out += [f"- {url}" for url in group["urls"]]
            out += ["", "</details>", ""]

    if errors:
        out += ["", "### Не удалось сверить", ""]
        out += [f"- {line}" for line in errors]
    return "\n".join(out) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=["telegram", "summary"], default="telegram")
    # Итог IndexNow считает соседний шаг маршрута, в файле сторожа его нет.
    parser.add_argument("--indexnow", default=None)
    args = parser.parse_args()
    report = json.load(sys.stdin)
    if args.indexnow:
        report["indexnow"] = args.indexnow
    builder = telegram_text if args.format == "telegram" else summary_markdown
    sys.stdout.write(builder(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
