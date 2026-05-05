import { runWithProjectNode } from "./run-command-with-project-node.mjs";

runWithProjectNode(["../node_modules/jest/bin/jest.js", ...process.argv.slice(2)]);
