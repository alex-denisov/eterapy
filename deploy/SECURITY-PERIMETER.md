# Сетевой периметр production-флота

Этот файл — источник истины для PRB-009. Пустой `iptables`/неактивный UFW на
виртуальной машине сам по себе не означает отсутствие фильтрации: у cloud.ru и
AWS она живёт в security groups провайдера. Не включайте host firewall
автоматически поверх этих правил: ошибочная политика может отрезать SSH,
WireGuard или LiveKit.

## Где живёт фильтрация

| Нода | Провайдер | Основной контроль | Публично разрешено |
|---|---|---|---|
| `eterapy-1` · `192.144.14.146` | cloud.ru | firewall/security group в консоли cloud.ru | `22/tcp`, `80/tcp`, `443/tcp`, `7881/tcp`, `50000/udp`, `51820/udp` |
| `eterapy-2` · `192.144.13.153` | cloud.ru | firewall/security group в консоли cloud.ru | `22/tcp`, `80/tcp`, `443/tcp`, `7881/tcp`, `50000/udp`, `51820/udp` |
| `eterapy-3` · `107.172.153.202` | RackNerd | сознательно: только точные bind'ы сервисов + внешний deploy-гейт | `22/tcp`, `80/tcp`, `443/tcp` |
| `eterapy-4` · `18.195.184.182` | AWS | EC2 Security Group | `22/tcp`, `80/tcp`, `443/tcp` |

`7881/tcp` и `50000/udp` — media transport LiveKit только на двух RU-нодах.
Сигналинг `7880/tcp` не публикуется: nginx/HAProxy достигают его через
loopback/WireGuard. `51820/udp` — WireGuard флота.

## Закрытые служебные порты

На всех четырёх публичных IP должны быть недоступны:

- `5432/tcp` — PostgreSQL;
- `3200/tcp` — Next.js и ops-agent;
- `6379/tcp` — Redis LiveKit;
- `7880/tcp` — LiveKit signalling.

Для RackNerd решение оставить UFW неактивным осознанное: Docker может обходить
обычные цепочки UFW, поэтому ложное ощущение защиты хуже проверяемого контракта.
На ноде web слушает `127.0.0.1:3200`, база и Redis наружу не публикуются.
Production workflow после каждого деплоя проверяет служебные порты с внешнего
GitHub runner и блокирует релиз при неожиданном listener.

## Доказательство 2026-07-28

Проверка с машины вне WireGuard:

- `22/80/443` доступны на всех нодах;
- `7881/tcp` доступен только на `eterapy-1` и `eterapy-2`;
- `5432/3200/6379/7880` закрыты на всех нодах;
- `50000/tcp` закрыт на всех нодах (LiveKit использует UDP).

Проверка `ss -lntup` на нодах подтвердила:

- primary: app `127.0.0.1:3200`, PostgreSQL `127.0.0.1` + `10.77.0.1`,
  Redis `127.0.0.1` + `10.77.0.1`, signalling `127.0.0.1` + `10.77.0.1`;
- standby: app/signalling только на `10.77.0.2`/loopback;
- RackNerd и AWS: app только `127.0.0.1:3200`;
- публичные TCP-listener'ы совпадают с таблицей выше.

## Правило для новых сервисов

Перед добавлением порта в compose/systemd:

1. классифицировать его как public, WireGuard-only или loopback-only;
2. обновить эту таблицу и provider security group, если порт public;
3. для WireGuard/loopback указать точный bind — не `0.0.0.0`;
4. после выкладки проверить `ss -lntup` на ноде и внешний reachability;
5. служебный порт не удалять из deploy-гейта без отдельного security review.
