import { canonicalCheckpoint, initialSmokeState } from "./kernel.mjs";

const status = document.querySelector("#status");
const checkpoint = document.querySelector("#checkpoint");
const actionButton = document.querySelector("#extract-action");
const worker = new Worker("./worker.mjs", { type: "module" });
let requestId = 0;
const pending = new Map();

function render(state, disposition) {
  status.textContent =
    disposition === "ready"
      ? "Worker ready — choose the public action"
      : `Worker advanced ${state.tick} ticks and extracted ${state.extracted}`;
  status.dataset.state = disposition;
  checkpoint.textContent = canonicalCheckpoint(state);
}

worker.addEventListener("message", (event) => {
  const response = event.data;
  const request = pending.get(response.requestId);
  if (!request) return;
  pending.delete(response.requestId);
  if (response.type === "result") request.resolve(response.state);
  else request.reject(new Error(response.message ?? "Worker failed."));
});

worker.addEventListener("error", (event) => {
  for (const request of pending.values()) request.reject(event.error);
  pending.clear();
});

export function runWorkerActions(actions) {
  requestId += 1;
  const id = requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({
      type: "run-user-actions",
      requestId: id,
      actions,
    });
  });
}

globalThis.__runBootstrapReplay = runWorkerActions;

actionButton.addEventListener("click", async () => {
  actionButton.disabled = true;
  try {
    render(await runWorkerActions(["extract", "idle", "extract"]), "advanced");
  } finally {
    actionButton.disabled = false;
  }
});

render(initialSmokeState(), "ready");
