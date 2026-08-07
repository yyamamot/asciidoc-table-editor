const { parentPort, workerData } = require("node:worker_threads");

const body = "x".repeat(1024 * 1024);
parentPort.postMessage({
  results: workerData.sources.map((_source, index) => ({ index, ok: true, html: `<p>${body}</p>` }))
});
