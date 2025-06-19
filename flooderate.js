import axios from "axios";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getUrlFromArgs() {
  const urlIndex = process.argv.indexOf("--url");
  if (urlIndex === -1 || urlIndex + 1 >= process.argv.length) {
    console.error('URL argument missing. Usage: pnpm test --url "https://example.com"');
    process.exit(1);
  }
  return process.argv[urlIndex + 1];
}

async function makeRequest(url) {
  try {
    const response = await axios(url);
    console.log(`[${new Date().toISOString()}] ${response.status} - ${url}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching ${url}:`, error.message);
  }
}

if (isMainThread) {
  const url = getUrlFromArgs();
  const numRequests = 1000;
  const maxThreads = 50;

  function runWorker(url) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: { url },
      });

      worker.on("message", resolve);
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  async function main() {
    const active = [];

    for (let i = 0; i < numRequests; i++) {
      if (active.length >= maxThreads) {
        await Promise.race(active);
        active.splice(
          active.findIndex((p) => p.isResolved),
          1
        );
      }

      const promise = runWorker(url);
      promise.isResolved = false;
      promise.then(() => (promise.isResolved = true));
      active.push(promise);
    }

    await Promise.all(active);
    console.log("Load test complete");
  }

  main().catch(console.error);
} else {
  const { url } = workerData;
  makeRequest(url)
    .then(() => parentPort.postMessage("done"))
    .catch((error) => parentPort.postMessage(error));
}
