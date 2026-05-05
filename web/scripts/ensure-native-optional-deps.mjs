import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

function platformSuffix() {
  const parts = [process.platform, process.arch];
  if (process.platform === "linux") {
    parts.push(process.report?.getReport?.().header?.glibcVersionRuntime ? "gnu" : "musl");
  } else if (process.platform === "win32") {
    parts.push("msvc");
  }
  return parts.join("-");
}

function ensureLightningCssBinary() {
  const suffix = platformSuffix();
  const packageName = `lightningcss-${suffix}`;
  let nativeEntry;
  try {
    nativeEntry = require.resolve(packageName);
  } catch {
    return;
  }

  const lightningCssEntry = require.resolve("lightningcss");
  const lightningCssRoot = path.dirname(path.dirname(lightningCssEntry));
  const fallbackPath = path.join(lightningCssRoot, `lightningcss.${suffix}.node`);
  if (!fs.existsSync(fallbackPath)) {
    fs.copyFileSync(nativeEntry, fallbackPath);
  }

  if (process.platform === "darwin") {
    for (const binaryPath of [nativeEntry, fallbackPath]) {
      spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", binaryPath], { stdio: "ignore" });
    }
  }
}

ensureLightningCssBinary();
