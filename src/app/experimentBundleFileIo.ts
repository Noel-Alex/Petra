import {
  EXPERIMENT_BUNDLE_FILE_MIME,
  inspectExperimentBundleImport,
  type ExperimentBundleExportFile,
  type ExperimentBundleImportInspection,
} from "./experimentBundleHandoff";

export const MAX_EXPERIMENT_BUNDLE_FILE_BYTES = 8 * 1024 * 1024;

export interface ExperimentBundleLocalFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  text(): Promise<string>;
}

export type ExperimentBundleFileReadResult =
  | {
      readonly status: "inspected";
      readonly filename: string;
      readonly inspection: ExperimentBundleImportInspection;
    }
  | {
      readonly status: "refused";
      readonly category:
        | "no-file"
        | "file-too-large"
        | "unsupported-file-type"
        | "file-read-failed";
      readonly message: string;
    };

export function createExperimentBundleBlob(
  prepared: ExperimentBundleExportFile,
): Blob {
  return new Blob([prepared.text], { type: prepared.mimeType });
}

export async function inspectExperimentBundleFile(
  file: ExperimentBundleLocalFile | null | undefined,
): Promise<ExperimentBundleFileReadResult> {
  if (file == null) {
    return refusal(
      "no-file",
      "Choose a Petra experiment file to inspect. The active run was not changed.",
    );
  }
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    file.size > MAX_EXPERIMENT_BUNDLE_FILE_BYTES
  ) {
    return refusal(
      "file-too-large",
      "This experiment file is too large to inspect safely. The active run was not changed.",
    );
  }

  const type = file.type.trim().toLowerCase();
  if (
    type !== "" &&
    type !== EXPERIMENT_BUNDLE_FILE_MIME &&
    type !== "text/json"
  ) {
    return refusal(
      "unsupported-file-type",
      "Choose a JSON Petra experiment file. The active run was not changed.",
    );
  }

  try {
    return Object.freeze({
      status: "inspected",
      filename: file.name,
      inspection: inspectExperimentBundleImport(await file.text()),
    });
  } catch {
    return refusal(
      "file-read-failed",
      "Petra could not read this local experiment file. The active run was not changed.",
    );
  }
}

function refusal(
  category:
    | "no-file"
    | "file-too-large"
    | "unsupported-file-type"
    | "file-read-failed",
  message: string,
): ExperimentBundleFileReadResult {
  return Object.freeze({ status: "refused", category, message });
}
