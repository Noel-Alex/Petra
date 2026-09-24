import { parentPort, workerData } from "node:worker_threads";

if (parentPort === null) {
  throw new Error("mechanistic worker host requires a worker thread parentPort");
}
if (
  workerData === null ||
  typeof workerData !== "object" ||
  typeof workerData.executorModuleUrl !== "string" ||
  workerData.executorModuleUrl.trim().length === 0
) {
  throw new TypeError("mechanistic worker host requires executorModuleUrl");
}

const executorModule = await import(workerData.executorModuleUrl);
if (typeof executorModule.executeMechanisticTask !== "function") {
  throw new TypeError(
    "mechanistic worker executor module must export executeMechanisticTask(task, executorData)",
  );
}

parentPort.on("message", async (message) => {
  if (
    message === null ||
    typeof message !== "object" ||
    message.type !== "execute" ||
    typeof message.requestId !== "string" ||
    message.requestId.length === 0
  ) {
    parentPort.postMessage({
      type: "protocol-error",
      message: "worker received malformed execute request",
    });
    return;
  }

  try {
    const result = await executorModule.executeMechanisticTask(
      message.task,
      workerData.executorData,
    );
    parentPort.postMessage({
      type: "result",
      requestId: message.requestId,
      result,
    });
  } catch (error) {
    parentPort.postMessage({
      type: "failure",
      requestId: message.requestId,
      failure: normalizeFailure(error),
    });
  }
});

parentPort.postMessage({ type: "ready" });

function normalizeFailure(error) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "mechanistic worker task failed",
    };
  }
  return {
    name: "NonErrorFailure",
    message: typeof error === "string" ? error : "mechanistic worker task failed",
  };
}
