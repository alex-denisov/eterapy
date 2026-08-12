// B667 — разбор аргументов точки входа релизного образа.
//
// Compose четырёх нод и стенда передаёт порт аргументом (`npm start -- --port
// 3200 --hostname 127.0.0.1`), а `server.js` из standalone читает только
// окружение. Ошибка здесь не видна ни сборке, ни тестам приложения: контейнер
// поднимется, healthcheck и nginx получат 502, и выглядеть это будет как
// «выкатка сломала сайт».

const { resolveServerEnv } = require("../../scripts/standalone-start-args.cjs");

describe("B667 · аргументы запуска standalone", () => {
  it("берёт порт и адрес из аргументов", () => {
    expect(resolveServerEnv(["--port", "3200", "--hostname", "127.0.0.1"], {})).toEqual({
      PORT: "3200",
      HOSTNAME: "127.0.0.1",
    });
  });

  it("понимает форму с знаком равенства и короткие флаги", () => {
    expect(resolveServerEnv(["--port=3201", "-H", "0.0.0.0"], {})).toEqual({
      PORT: "3201",
      HOSTNAME: "0.0.0.0",
    });
    expect(resolveServerEnv(["-p", "3000", "--host=::"], {})).toEqual({
      PORT: "3000",
      HOSTNAME: "::",
    });
  });

  it("аргумент перекрывает окружение, окружение работает без аргументов", () => {
    const env = { PORT: "3000", HOSTNAME: "0.0.0.0" };
    expect(resolveServerEnv([], env)).toEqual({ PORT: "3000", HOSTNAME: "0.0.0.0" });
    expect(resolveServerEnv(["--port", "3201"], env)).toEqual({
      PORT: "3201",
      HOSTNAME: "0.0.0.0",
    });
  });

  it("неизвестный аргумент — отказ запуска, а не тихое умолчание", () => {
    expect(() => resolveServerEnv(["--turbo"], { PORT: "3000", HOSTNAME: "0.0.0.0" })).toThrow(
      /неизвестный аргумент --turbo/,
    );
  });

  it("не подменяет отсутствующий или негодный порт на 3000", () => {
    expect(() => resolveServerEnv([], { HOSTNAME: "127.0.0.1" })).toThrow(/порт не задан/);
    expect(() => resolveServerEnv(["--port", "${ETERAPY_APP_PORT}"], {})).toThrow(
      /не похож на номер порта/,
    );
    expect(() => resolveServerEnv(["--port", "0"], {})).toThrow(/не похож на номер порта/);
  });

  it("требует адрес: без него сервер слушал бы не тот интерфейс", () => {
    expect(() => resolveServerEnv(["--port", "3200"], {})).toThrow(/адрес не задан/);
  });
});
