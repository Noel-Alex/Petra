import { Worker } from "node:worker_threads";

export class WorkerThreadMechanisticExecutor {
  constructor(options) {
    if (options === null || typeof options !== "object") {
      throw new TypeError("worker thread executor options must be an object");
    }
    requirePositiveSafeInteger("maxWorkers", options.maxWorkers);
    requireNonEmptyString("executorModuleUrl", options.executorModuleUrl);

    this.maxWorkers = options.maxWorkers;
    this.executorModuleUrl = options.executorModuleUrl;
    this.executorData = options.executorData;
    this.workerModuleUrl =
      options.workerModuleUrl ??
      new URL("./workerThreadHost.mjs", import.meta.url);
    this.queue = [];
    this.slots = new Set();
    this.nextRequestId = 0;
    this.disposed = false;
  }

  execute(task) {
    if (this.disposed) {
      return Promise.reject(new Error("worker thread executor is disposed"));
    }
    if (task === null || typeof task !== "object") {
      return Promise.reject(new TypeError("mechanistic task must be an object"));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.ensureCapacity();
      this.dispatch();
    });
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;

    const error = new Error("worker thread executor disposed before task completion");
    for (const queued of this.queue.splice(0)) {
      queued.reject(error);
    }

    const terminations = [];
    for (const slot of this.slots) {
      if (slot.current !== null) {
        slot.current.reject(error);
        slot.current = null;
      }
      slot.retiring = true;
      terminations.push(slot.worker.terminate());
    }
    this.slots.clear();
    await Promise.allSettled(terminations);
  }

  ensureCapacity() {
    while (
      !this.disposed &&
      this.queue.length > this.readyIdleCount() &&
      this.slots.size < this.maxWorkers
    ) {
      this.spawnWorker();
    }
  }

  readyIdleCount() {
    let count = 0;
    for (const slot of this.slots) {
      if (slot.ready && slot.current === null && !slot.retiring) count += 1;
    }
    return count;
  }

  spawnWorker() {
    const worker = new Worker(this.workerModuleUrl, {
      type: "module",
      workerData: {
        executorModuleUrl: this.executorModuleUrl,
        executorData: this.executorData,
      },
    });
    const slot = {
      worker,
      ready: false,
      retiring: false,
      current: null,
    };
    this.slots.add(slot);

    worker.on("message", (message) => this.handleMessage(slot, message));
    worker.on("error", (error) => this.handleWorkerFailure(slot, error));
    worker.on("exit", (code) => {
      if (slot.retiring) return;
      if (code !== 0) {
        this.handleWorkerFailure(
          slot,
          new Error("mechanistic worker exited with code " + code),
        );
      } else {
        this.retireSlot(slot);
      }
    });
  }

  handleMessage(slot, message) {
    if (message === null || typeof message !== "object") {
      this.handleWorkerFailure(
        slot,
        new Error("mechanistic worker emitted a malformed message"),
      );
      return;
    }
    if (message.type === "ready") {
      slot.ready = true;
      this.dispatch();
      return;
    }
    if (message.type === "protocol-error") {
      this.handleWorkerFailure(
        slot,
        new Error(
          typeof message.message === "string"
            ? message.message
            : "mechanistic worker protocol error",
        ),
      );
      return;
    }

    const current = slot.current;
    if (current === null) {
      this.handleWorkerFailure(
        slot,
        new Error("mechanistic worker returned a result without an active task"),
      );
      return;
    }
    if (message.requestId !== current.requestId) {
      this.handleWorkerFailure(
        slot,
        new Error("mechanistic worker response requestId mismatch"),
      );
      return;
    }

    slot.current = null;
    if (message.type === "result") {
      current.resolve(message.result);
    } else if (message.type === "failure") {
      const failure = message.failure;
      const error = new Error(
        failure && typeof failure.message === "string"
          ? failure.message
          : "mechanistic worker task failed",
      );
      error.name =
        failure && typeof failure.name === "string" && failure.name.length > 0
          ? failure.name
          : "Error";
      current.reject(error);
    } else {
      current.reject(new Error("mechanistic worker returned an unknown message type"));
    }

    this.ensureCapacity();
    this.dispatch();
  }

  handleWorkerFailure(slot, error) {
    if (!this.slots.has(slot)) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    if (slot.current !== null) {
      slot.current.reject(failure);
      slot.current = null;
    }
    this.retireSlot(slot);
    this.ensureCapacity();
    this.dispatch();
  }

  retireSlot(slot) {
    if (!this.slots.has(slot)) return;
    slot.retiring = true;
    this.slots.delete(slot);
    void slot.worker.terminate();
  }

  dispatch() {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (this.queue.length === 0) break;
      if (!slot.ready || slot.current !== null || slot.retiring) continue;

      const queued = this.queue.shift();
      const requestId = "mechanistic-worker-request-" + this.nextRequestId;
      this.nextRequestId += 1;
      const current = { ...queued, requestId };
      slot.current = current;
      try {
        slot.worker.postMessage({
          type: "execute",
          requestId,
          task: queued.task,
        });
      } catch (error) {
        slot.current = null;
        queued.reject(error);
        this.retireSlot(slot);
        this.ensureCapacity();
      }
    }
  }
}

function requirePositiveSafeInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(name + " must be a positive safe integer");
  }
}

function requireNonEmptyString(name, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(name + " must be a non-empty string");
  }
}
