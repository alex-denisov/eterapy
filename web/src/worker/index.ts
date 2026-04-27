import "dotenv/config";
import { randomUUID } from "crypto";
import { runWorker, shutdownWorker } from "@/lib/job-worker";
import { log, serializeError } from "@/lib/logger";

const workerId = process.env.WORKER_ID || `worker-${randomUUID()}`;
const queue = process.env.WORKER_QUEUE || "default";
const pollMs = Number(process.env.WORKER_POLL_MS || 2_000);
const staleAfterMs = Number(process.env.WORKER_STALE_AFTER_MS || 10 * 60_000);
let stopping = false;

function requestStop(signal: NodeJS.Signals) {
  stopping = true;
  log.warn("worker-stop-requested", { workerId, queue, signal });
}

process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);

runWorker({
  workerId,
  queue,
  pollMs,
  staleAfterMs,
  shouldStop: () => stopping,
}).catch((err) => {
  log.error("worker-crashed", {
    workerId,
    queue,
    error: serializeError(err),
  });
  process.exitCode = 1;
}).finally(async () => {
  await shutdownWorker();
});
