const { parentPort, workerData } = require("node:worker_threads");

const results = [];
results.length = workerData.sources.length;
results[0] = { index: 0, ok: true, html: "<p>first only</p>" };
parentPort.postMessage({ results });
