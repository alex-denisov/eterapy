import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Allow the conventional leading-underscore "intentionally unused" marker for
  // args, locals and caught errors (e.g. a prop kept on a component's public
  // type but not consumed in the body: `{ title: _title }`).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // B667: точка входа релизного образа лежит рядом с `server.js` из
  // standalone-сборки, а он CommonJS. `require` здесь — не стиль, а формат
  // модуля; тест на разбор аргументов подключает тот же файл.
  {
    files: ["**/*.cjs", "src/__tests__/b667-standalone-start-args.test.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
