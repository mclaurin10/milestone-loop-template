import { runUserActions } from "./kernel.mjs";

self.addEventListener("message", (event) => {
  const request = event.data;
  if (
    typeof request !== "object" ||
    request === null ||
    request.type !== "run-user-actions" ||
    !Array.isArray(request.actions)
  ) {
    self.postMessage({ type: "error", message: "Invalid Worker request." });
    return;
  }
  try {
    self.postMessage({
      type: "result",
      requestId: request.requestId,
      state: runUserActions(request.actions),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
