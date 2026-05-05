import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const preferredNode = path.join(process.env.HOME ?? "", ".nvm/versions/node/v24.14.1/bin/node");

export function projectNode() {
  if (preferredNode && fs.existsSync(preferredNode)) {
    return preferredNode;
  }

  return process.execPath;
}

export function runWithProjectNode(args) {
  const node = projectNode();
  const env = {
    ...process.env,
    PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  const result = spawnSync(node, args, { stdio: "inherit", env });

  if (typeof result.status === "number") {
    process.exit(result.status);
  }

  if (result.error) {
    console.error(result.error);
  }
  process.exit(1);
}
