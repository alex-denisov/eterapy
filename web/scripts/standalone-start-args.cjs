// B667 — разбор аргументов запуска standalone-сервера.
//
// `next start` понимал `--port` и `--hostname`; `server.js` из standalone-сборки
// не понимает ничего и читает только окружение `PORT`/`HOSTNAME`. Compose-файлы
// четырёх нод и стенда передают порт именно аргументом, и молчаливое падение к
// умолчанию 3000 означало бы 502 у nginx на всём контуре — то есть отказ,
// который виден только снаружи и только после выкатки.
//
// Поэтому аргументы разбираются явно, а неизвестный аргумент — ошибка запуска:
// лучше не подняться с внятной строкой в журнале, чем подняться не туда.

/**
 * @param {string[]} argv аргументы после имени скрипта
 * @param {Record<string, string | undefined>} env текущее окружение
 * @returns {{ PORT: string, HOSTNAME: string }}
 */
function resolveServerEnv(argv, env = {}) {
  let port = env.PORT;
  let hostname = env.HOSTNAME;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const [flag, inlineValue] = eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      i += 1;
      return argv[i];
    };

    if (flag === "--port" || flag === "-p") {
      port = takeValue();
    } else if (flag === "--hostname" || flag === "--host" || flag === "-H") {
      hostname = takeValue();
    } else {
      throw new Error(`standalone start: неизвестный аргумент ${arg}`);
    }
  }

  if (port === undefined || port === "") {
    throw new Error("standalone start: порт не задан ни аргументом --port, ни переменной PORT");
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error(`standalone start: порт «${port}» не похож на номер порта`);
  }
  if (hostname === undefined || hostname === "") {
    throw new Error(
      "standalone start: адрес не задан ни аргументом --hostname, ни переменной HOSTNAME",
    );
  }

  return { PORT: port, HOSTNAME: hostname };
}

module.exports = { resolveServerEnv };
