const { parentPort, workerData } = require("node:worker_threads");

parentPort.postMessage({
  results: workerData.sources.map((_source, index) => ({ index, ok: true, html: `<strong>alternate-${index}</strong>` }))
});
