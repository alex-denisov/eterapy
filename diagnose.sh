#!/bin/bash

echo "=== Диагностика HTTPS eterapy.com ==="
echo ""

echo "1. Проверка Docker контейнера:"
docker ps | grep nginx
echo ""

echo "2. Проверка портов (локально):"
lsof -i :80 -i :443 | grep -i listen | head -5
echo ""

echo "3. Проверка HTTP (локально):"
curl -sI http://127.0.0.1 --resolve eterapy.com:80:127.0.0.1 2>&1 | head -5
echo ""

echo "4. Проверка HTTPS (локально):"
curl -sk https://127.0.0.1 --resolve eterapy.com:443:127.0.0.1 -o /dev/null -w "HTTP Status: %{http_code}\nSSL Verify: %{ssl_verify_result}\n"
echo ""

echo "5. Внешний IP:"
curl -s ifconfig.me 2>/dev/null || echo "Не удалось определить"
echo ""

echo "6. DNS запись eterapy.com:"
dig eterapy.com +short
echo ""

echo "7. Проверка HTTPS по внешнему IP:"
curl -sk https://95.31.15.122 --resolve eterapy.com:443:95.31.15.122 -o /dev/null -w "HTTP Status: %{http_code}\n" 2>&1
echo ""

echo "=== Конец диагностики ==="
