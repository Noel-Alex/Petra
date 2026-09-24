import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

const RECORD_SUFFIX = ".record.json";
const ROW_SUFFIX = ".rows.jsonl";
const READ_CHUNK_BYTES = 64 * 1024;

export class FilesystemMechanisticStagingStore {
  constructor(rootDirectory) {
    requireNonEmptyString("rootDirectory", rootDirectory);
    this.rootDirectory = resolve(rootDirectory);
    this.pendingDirectory = join(this.rootDirectory, "pending");
    this.committedDirectory = join(this.rootDirectory, "committed");
    mkdirSync(this.pendingDirectory, { recursive: true });
    mkdirSync(this.committedDirectory, { recursive: true });
  }

  listCommitted() {
    const records = [];
    const names = readdirSync(this.committedDirectory)
      .filter((name) => name.endsWith(RECORD_SUFFIX))
      .sort();

    for (const name of names) {
      const path = join(this.committedDirectory, name);
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("committed mechanistic stage metadata must be an object: " + name);
      }
      records.push(Object.freeze({ ...parsed }));
    }

    return Object.freeze(records);
  }

  beginTrajectory(taskId) {
    requireNonEmptyString("taskId", taskId);
    const key = taskStorageKey(taskId);
    const finalRows = join(this.committedDirectory, key + ROW_SUFFIX);
    const finalRecord = join(this.committedDirectory, key + RECORD_SUFFIX);

    if (existsSync(finalRecord)) {
      throw new Error("trajectory " + taskId + " is already committed");
    }

    const pendingDirectory = join(
      this.pendingDirectory,
      key + "." + process.pid + "." + randomUUID(),
    );
    mkdirSync(pendingDirectory, { recursive: false });
    const pendingRows = join(pendingDirectory, "rows.partial");
    let descriptor = openSync(pendingRows, "wx");
    let finished = false;

    const closePending = () => {
      if (descriptor !== null) {
        closeSync(descriptor);
        descriptor = null;
      }
    };

    return {
      writeRow: (line) => {
        assertWriterActive(finished);
        validateRow(line);
        writeSync(descriptor, line + "\n", undefined, "utf8");
      },
      commit: (record) => {
        assertWriterActive(finished);
        if (
          record === null ||
          typeof record !== "object" ||
          Array.isArray(record) ||
          record.taskId !== taskId
        ) {
          throw new TypeError("committed stage record must match writer taskId");
        }
        if (existsSync(finalRecord)) {
          throw new Error("trajectory " + taskId + " became committed concurrently");
        }

        fsyncSync(descriptor);
        closePending();

        // A crash after rows are renamed but before metadata is published leaves
        // only an invisible orphan row file. Replacing that orphan is safe
        // because listCommitted() treats metadata as the sole commit marker.
        if (existsSync(finalRows)) unlinkSync(finalRows);
        renameSync(pendingRows, finalRows);

        try {
          writeJsonAtomically(finalRecord, record);
          finished = true;
          rmSync(pendingDirectory, { recursive: true, force: true });
        } catch (error) {
          // Never leave a committed marker for rows whose metadata publication
          // failed. The orphan rows remain non-authoritative and can be replaced.
          if (existsSync(finalRecord)) unlinkSync(finalRecord);
          throw error;
        }
      },
      abort: () => {
        if (finished) return;
        closePending();
        finished = true;
        rmSync(pendingDirectory, { recursive: true, force: true });
      },
    };
  }

  readRows(taskId) {
    requireNonEmptyString("taskId", taskId);
    const key = taskStorageKey(taskId);
    const recordPath = join(this.committedDirectory, key + RECORD_SUFFIX);
    const rowsPath = join(this.committedDirectory, key + ROW_SUFFIX);
    if (!existsSync(recordPath)) {
      throw new RangeError("trajectory " + taskId + " has no committed stage record");
    }
    if (!existsSync(rowsPath)) {
      throw new RangeError("trajectory " + taskId + " is committed but its rows are missing");
    }
    return readUtf8Lines(rowsPath);
  }
}

export class FilesystemMechanisticFinalOutput {
  constructor(rootDirectory, baseName = "mechanistic-dataset") {
    requireNonEmptyString("rootDirectory", rootDirectory);
    requireSafeBaseName(baseName);
    this.rootDirectory = resolve(rootDirectory);
    this.datasetPath = join(this.rootDirectory, baseName + ".jsonl");
    this.finalizationPath = join(
      this.rootDirectory,
      baseName + ".finalization.json",
    );
    this.partialPath = join(
      this.rootDirectory,
      "." + baseName + "." + process.pid + ".partial.jsonl",
    );
    mkdirSync(this.rootDirectory, { recursive: true });
    this.descriptor = null;
    this.activePlanDigest = null;
  }

  begin(planDigest) {
    requireNonEmptyString("planDigest", planDigest);
    if (this.descriptor !== null) {
      throw new Error("final output is already active");
    }
    rmSync(this.partialPath, { force: true });
    this.descriptor = openSync(this.partialPath, "wx");
    this.activePlanDigest = planDigest;
  }

  writeRow(line) {
    this.assertActive();
    validateRow(line);
    writeSync(this.descriptor, line + "\n", undefined, "utf8");
  }

  commit(finalization) {
    this.assertActive();
    if (
      finalization === null ||
      typeof finalization !== "object" ||
      Array.isArray(finalization) ||
      finalization.planDigest !== this.activePlanDigest
    ) {
      throw new TypeError("finalization planDigest must match active output");
    }

    fsyncSync(this.descriptor);
    closeSync(this.descriptor);
    this.descriptor = null;

    // Remove the completion marker before replacing the data file. During this
    // short window consumers see an incomplete output, never a falsely complete
    // one. Publish the new completion marker last.
    rmSync(this.finalizationPath, { force: true });
    renameSync(this.partialPath, this.datasetPath);
    try {
      writeJsonAtomically(this.finalizationPath, finalization);
      this.activePlanDigest = null;
    } catch (error) {
      this.activePlanDigest = null;
      throw error;
    }
  }

  abort() {
    if (this.descriptor !== null) {
      closeSync(this.descriptor);
      this.descriptor = null;
    }
    rmSync(this.partialPath, { force: true });
    this.activePlanDigest = null;
  }

  assertActive() {
    if (this.descriptor === null || this.activePlanDigest === null) {
      throw new Error("final output is not active");
    }
  }
}

export function readFilesystemFinalization(path) {
  requireNonEmptyString("path", path);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("mechanistic finalization metadata must be an object");
  }
  return Object.freeze({ ...parsed });
}

function taskStorageKey(taskId) {
  return createHash("sha256").update(taskId, "utf8").digest("hex");
}

function writeJsonAtomically(path, value) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = join(
    directory,
    "." + basename(path) + "." + process.pid + "." + randomUUID() + ".tmp",
  );
  let descriptor = null;
  try {
    descriptor = openSync(temporary, "wx");
    writeFileSync(descriptor, JSON.stringify(value) + "\n", "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, path);
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(temporary, { force: true });
    throw error;
  }
}

function* readUtf8Lines(path) {
  const descriptor = openSync(path, "r");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let carry = "";
  try {
    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      carry += decoder.write(buffer.subarray(0, bytesRead));
      let newline = carry.indexOf("\n");
      while (newline >= 0) {
        const line = carry.slice(0, newline);
        carry = carry.slice(newline + 1);
        if (line.endsWith("\r")) {
          throw new TypeError("staged rows must use LF newlines");
        }
        if (line.length > 0) yield line;
        newline = carry.indexOf("\n");
      }
    }
    carry += decoder.end();
    if (carry.length > 0) {
      if (carry.endsWith("\r")) {
        throw new TypeError("staged rows must use LF newlines");
      }
      yield carry;
    }
  } finally {
    closeSync(descriptor);
  }
}

function validateRow(line) {
  if (typeof line !== "string" || line.length === 0) {
    throw new TypeError("mechanistic dataset row must be a non-empty string");
  }
  if (line.includes("\n") || line.includes("\r")) {
    throw new TypeError("mechanistic dataset row must not contain literal newlines");
  }
}

function requireSafeBaseName(value) {
  requireNonEmptyString("baseName", value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new TypeError("baseName must be a simple filesystem-safe name");
  }
}

function requireNonEmptyString(name, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(name + " must be a non-empty string");
  }
}

function assertWriterActive(finished) {
  if (finished) throw new Error("trajectory stage writer is already finished");
}
