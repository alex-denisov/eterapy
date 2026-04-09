# Исправления авторизации

## Что было исправлено

### 1. Nginx конфиг (`nginx/conf.d/eterapy-https.conf`)
- Убрано дублирование `location /_next/static/`
- Установлен `X-Forwarded-Proto: https` (вместо `$scheme`)
- Добавлен `X-Forwarded-Host: $host`
- Отключено кеширование для proxy

### 2. NextAuth (`web/src/lib/auth.ts`)
- Убрана явная конфигурация cookies (NextAuth v5 определяет автоматически)
- `trustHost: true` уже установлен - этого достаточно для работы за proxy

### 3. Middleware (`web/src/middleware.ts`)
- **ОТКЛЮЧЕН** - в NextAuth v5 с `trustHost: true` middleware не нужен
- Middleware мог ломать определение протокола и CSRF токены

## Что нужно сделать

### 1. Перезапустить Next.js dev сервер

В терминале где запущен `next dev`:
1. Нажмите `Ctrl+C` для остановки
2. Запустите снова: `cd web && npm run dev`

### 2. Очистить cookies в браузере

Откройте DevTools → Application → Cookies → удалите все cookies для `eterapy.com`

### 3. Протестировать

1. Откройте https://eterapy.com
2. Попробуйте войти через email/password (client@test.eterapy.com / test1234)
3. Проверьте что ошибка `MissingCSRF` больше не появляется
4. Проверьте OAuth (VK, Google)

## Как это работает

```
Браузер (HTTPS) 
  → Nginx (SSL termination, порты 80/443)
    → localhost:3000 (Next.js dev server, HTTP)
      ← X-Forwarded-Proto: https
      ← X-Forwarded-Host: eterapy.com
```

NextAuth v5 с `trustHost: true`:
- Видит `X-Forwarded-Proto: https` → использует secure cookies
- Генерирует CSRF токены правильно
- Все auth endpoints работают корректно

## Проверка серверной части (работает ✅)

```bash
# Получить CSRF токен
curl https://eterapy.com/api/auth/csrf

# Войти через credentials
curl -c /tmp/cookies.txt -X POST https://eterapy.com/api/auth/callback/credentials \
  -d "email=client@test.eterapy.com&password=test1234&csrfToken=<TOKEN>&json=true"

# Проверить сессию
curl -b /tmp/cookies.txt https://eterapy.com/api/auth/session
```

## Если всё ещё есть проблемы

1. Убедитесь что `NEXTAUTH_URL=https://eterapy.com` в `.env.local`
2. Убедитесь что `AUTH_TRUST_HOST=true` в `.env.local`
3. Откройте консоль браузера (F12) → Network → проверьте что `/api/auth/session` возвращает JSON, не HTML
4. Проверьте что cookies имеют флаги `Secure` и `SameSite=Lax`
