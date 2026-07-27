// B604 — «при переходе на кабинет шапка на секунду сбрасывается, будто меня
// вылогинивает».
//
// Сессии там не теряется: шапка живёт в КОРНЕВОМ layout и читает её через
// `useSession()`, то есть до гидратации знает только «loading» и рисует
// гостевой вариант. Пробросить сессию с сервера первым кадром нельзя: корневое
// дерево обязано собираться заранее (INC-080), а `auth()` в нём возвращает весь
// сайт в динамический рендер — ровно та причина, которую мы только что убрали.
//
// Поэтому подсказка, а не данные: ВИДИМАЯ метка-кука, по которой пре-paint
// скрипт ставит атрибут на <html>, а CSS прячет гостевой блок и показывает на
// его месте заглушку. Тот же приём, что и у плашки имперсонации
// (`eterapy-imp-on`): метка ничего не разрешает — подделка даёт ровно одну
// возможность, показать самому себе серую пилюлю на долю секунды. Настоящие
// полномочия остаются в подписанном httpOnly-куке сессии.
//
// Почему кука, а не localStorage: скрипту нужно решение ДО первого кадра, и
// читать он должен то, что уже пришло с документом.

/** Видимая метка «этот браузер недавно был авторизован». Значение всегда "1". */
export const AUTH_HINT_COOKIE = "eterapy-auth-on";

/** Атрибут на <html>, по которому CSS решает, что рисовать до гидратации. */
export const AUTH_HINT_ATTR = "data-auth-hint";

/** Метка живёт месяц: дольше сессии не нужно, короче — вернётся мигание. */
const AUTH_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Есть ли метка в строке кук. Чистая функция — проверяется прогоном. */
export function hasAuthHint(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false;
  return cookieString
    .split(";")
    .some((part) => part.trim().startsWith(`${AUTH_HINT_COOKIE}=1`));
}

/**
 * Привести метку и атрибут в соответствие тому, что вернула сессия. Зовётся из
 * шапки, когда `useSession()` перестал быть «loading»: метка всегда следует за
 * правдой, а не наоборот.
 */
export function syncAuthHint(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  if (signedIn) {
    document.cookie = `${AUTH_HINT_COOKIE}=1; path=/; max-age=${AUTH_HINT_MAX_AGE_SECONDS}; samesite=lax${secure}`;
    document.documentElement.setAttribute(AUTH_HINT_ATTR, "1");
    return;
  }
  document.cookie = `${AUTH_HINT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  document.documentElement.removeAttribute(AUTH_HINT_ATTR);
}

/**
 * Пре-paint часть: ставит атрибут по метке до первого кадра. Едет одной строкой
 * вместе со скриптом mini-app — один inline-скрипт, один хеш в CSP (INC-069).
 */
export const AUTH_HINT_INLINE_SCRIPT = `(function(){try{
if(document.cookie.split(";").some(function(c){return c.trim().indexOf("${AUTH_HINT_COOKIE}=1")===0;})){document.documentElement.setAttribute("${AUTH_HINT_ATTR}","1");}
}catch(e){}})();`;
