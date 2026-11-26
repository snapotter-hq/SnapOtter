// Plain JavaScript on purpose: see runInWorker. The API runs from TS source
// under tsx, so this file ships with src/ and needs no build step.
import { parentPort, workerData } from "node:worker_threads";
import { optimize } from "svgo";

try {
  const { svg, config } = workerData;
  parentPort.postMessage({ ok: true, value: optimize(svg, config).data });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    error: { name: err?.name ?? "Error", message: err?.message ?? String(err) },
  });
}
