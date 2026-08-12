#!/usr/bin/env node
// B667 — точка входа `npm start` в релизном образе.
//
// Лежит рядом с `server.js` внутри standalone-дерева (`/app/web/`), поэтому
// требует соседа относительным путём. В репозитории соседа нет — файл
// исполняется только в образе; разбор аргументов вынесен в
// `standalone-start-args.cjs` и покрыт тестами отдельно.

const { resolveServerEnv } = require("./standalone-start-args.cjs");

const resolved = resolveServerEnv(process.argv.slice(2), process.env);
process.env.PORT = resolved.PORT;
process.env.HOSTNAME = resolved.HOSTNAME;

require("./server.js");
