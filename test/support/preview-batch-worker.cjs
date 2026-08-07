const { parentPort, workerData } = require("node:worker_threads");

parentPort.postMessage({
  results: workerData.sources.map((source, index) => source.trim() === "FAIL_FRAGMENT"
    ? { index, ok: false, message: "fixture fragment failure" }
    : { index, ok: true, html: `<p data-fragment="${index}">${escapeHtml(source)}</p>` })
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
