export const metadata = {
  title: "Политика cookies — ETerapy",
  description: "Как ETerapy использует файлы cookie и как управлять своими настройками.",
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <article className="prose prose-invert prose-sm max-w-none">
      <h1 className="font-heading text-2xl font-bold">Политика использования cookies</h1>
      <p className="text-muted-foreground">Редакция от 16 мая 2026 г.</p>

      <h2>1. Что такое cookies</h2>
      <p>
        Файлы cookie — это небольшие текстовые файлы, которые сохраняются в вашем браузере при посещении
        сайта. Они помогают платформе работать корректно, запоминать настройки и анализировать
        использование сервиса.
      </p>

      <h2>2. Какие cookies мы используем</h2>

      <h3>2.1. Необходимые cookies (всегда активны)</h3>
      <p>Эти файлы требуются для базовой работы платформы и не могут быть отключены:</p>
      <ul>
        <li><strong>session</strong> — хранит токен аутентификации для вашей сессии. Удаляется при выходе из аккаунта.</li>
        <li><strong>csrf</strong> — защищает от межсайтовой подделки запросов (CSRF).</li>
        <li><strong>cookie_consent</strong> — запоминает ваш выбор в отношении аналитических cookies.</li>
      </ul>

      <h3>2.2. Аналитические cookies (только с согласия)</h3>
      <p>
        Загружаются <strong>только с вашего явного согласия</strong>. Используются для понимания того,
        как пользователи взаимодействуют с платформой, и для её улучшения.
      </p>
      <ul>
        <li>
          <strong>Яндекс.Метрика</strong> — анализ посещаемости, поведения на странице и записи сессий (WebVisor).
          Данные отправляются на серверы Яндекса. Политика конфиденциальности Яндекса:&nbsp;
          <a href="https://yandex.ru/legal/confidential" target="_blank" rel="noopener noreferrer">yandex.ru/legal/confidential</a>.
        </li>
        <li>
          <strong>Google Analytics 4</strong> — анализ трафика и поведения пользователей.
          Данные отправляются на серверы Google. Политика конфиденциальности Google:&nbsp;
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a>.
        </li>
      </ul>

      <h2>3. Как управлять cookies</h2>
      <p>
        При первом посещении сайта вы видите баннер согласия. Вы можете выбрать:
      </p>
      <ul>
        <li><strong>«Принять все»</strong> — разрешить необходимые и аналитические cookies.</li>
        <li><strong>«Только необходимые»</strong> — разрешить только cookies, необходимые для работы платформы.
          Аналитические скрипты при этом не загружаются и данные не собираются.</li>
      </ul>
      <p>
        Изменить выбор можно в любой момент, обновив страницу или обратившись на&nbsp;
        <a href="mailto:privacy@eterapy.com">privacy@eterapy.com</a>.
      </p>
      <p>
        Также вы можете управлять cookies через настройки браузера. Обратите внимание: отключение
        необходимых cookies может повлиять на работу платформы (например, вход в аккаунт).
      </p>

      <h2>4. Хранение cookies</h2>
      <ul>
        <li>Сессионные cookies удаляются при закрытии браузера.</li>
        <li>Постоянные cookies хранятся до истечения срока или до ручного удаления.</li>
        <li>Аналитические cookies: срок хранения до 13 месяцев (согласно рекомендациям CNIL/GDPR).</li>
      </ul>

      <h2>5. Контакт</h2>
      <p>
        По вопросам, связанным с cookies и обработкой данных:&nbsp;
        <a href="mailto:privacy@eterapy.com">privacy@eterapy.com</a>
      </p>
      <p>Полная политика конфиденциальности: <a href="/legal/privacy">eterapy.com/legal/privacy</a></p>
    </article>
  );
}
