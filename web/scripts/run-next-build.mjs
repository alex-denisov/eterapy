import { runWithProjectNode } from "./run-command-with-project-node.mjs";

runWithProjectNode(["../node_modules/next/dist/bin/next", "build", "--webpack"]);
