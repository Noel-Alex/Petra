import type { InterventionTool } from "../ui/interventionPreview";
import {
  parseCiprofloxacinToolAuthority,
  type CiprofloxacinToolAuthority,
} from "./ciprofloxacinToolAuthority";
import type { RuntimeUiStatus } from "./runtimeView";

export type InterventionUnavailableReason =
  | "runtime-unavailable"
  | "runtime-starting"
  | "runtime-pending"
  | "runtime-error"
  | "authoritative-metadata-unavailable"
  | "authoritative-metadata-invalid";

export interface InterventionToolAvailability {
  readonly tool: InterventionTool;
  readonly label: string;
  readonly available: boolean;
}

export interface InterventionCapabilityView {
  readonly available: boolean;
  /** Placement-only preview may be enabled without granting simulation authority. */
  readonly previewAvailable: boolean;
  readonly reason: InterventionUnavailableReason | null;
  readonly message: string;
  readonly tools: readonly InterventionToolAvailability[];
  readonly ciprofloxacinAuthority: CiprofloxacinToolAuthority | null;
}

const TOOL_LABELS: Readonly<Record<InterventionTool, string>> = Object.freeze({
  inoculate: "Inoculate",
  fungus: "Fungi",
  antibiotic: "Antibiotic",
  nutrient: "Nutrient",
});

export function projectInterventionCapability(
  runtimeStatus: RuntimeUiStatus,
  ciprofloxacinMetadata: unknown = null,
): InterventionCapabilityView {
  switch (runtimeStatus) {
    case "unavailable":
      return unavailable(
        "runtime-unavailable",
        "Authoritative simulation is not connected. Intervention tools remain unavailable.",
      );
    case "starting":
      return unavailable(
        "runtime-starting",
        "Authoritative simulation is starting. Intervention tools stay unavailable until compatible intervention authority is ready.",
      );
    case "pending":
      return unavailable(
        "runtime-pending",
        "An authoritative simulation request is in flight. Placement preview remains available, but scientific application stays locked until authority is ready.",
        true,
      );
    case "error":
      return unavailable(
        "runtime-error",
        "The authoritative simulation is in an error state. Intervention tools are unavailable.",
      );
    case "ready":
      return projectReadyCapability(ciprofloxacinMetadata);
  }
}

function projectReadyCapability(
  ciprofloxacinMetadata: unknown,
): InterventionCapabilityView {
  if (ciprofloxacinMetadata === null || ciprofloxacinMetadata === undefined) {
    return unavailable(
      "authoritative-metadata-unavailable",
      "Protocol v5 supports authoritative ciprofloxacin application, but the active scenario has not supplied exact intervention bounds, default, and geometry metadata. Placement preview remains available; Petra will not infer dose controls from MIC values or test fixtures.",
      true,
    );
  }

  let authority: CiprofloxacinToolAuthority;
  try {
    authority = parseCiprofloxacinToolAuthority(ciprofloxacinMetadata);
  } catch {
    return unavailable(
      "authoritative-metadata-invalid",
      "The active scenario supplied invalid ciprofloxacin intervention metadata. Scientific application remains unavailable until the metadata is corrected.",
      true,
    );
  }

  return {
    available: true,
    previewAvailable: true,
    reason: null,
    message:
      "Authoritative ciprofloxacin intervention metadata is available. Unsupported intervention families remain unavailable.",
    tools: toolAvailability(true),
    ciprofloxacinAuthority: authority,
  };
}

function unavailable(
  reason: InterventionUnavailableReason,
  message: string,
  previewAvailable = false,
): InterventionCapabilityView {
  return {
    available: false,
    previewAvailable,
    reason,
    message,
    tools: toolAvailability(false),
    ciprofloxacinAuthority: null,
  };
}

function toolAvailability(
  antibioticAvailable: boolean,
): readonly InterventionToolAvailability[] {
  return Object.freeze(
    (Object.keys(TOOL_LABELS) as InterventionTool[]).map((tool) =>
      Object.freeze({
        tool,
        label: TOOL_LABELS[tool],
        available: tool === "antibiotic" && antibioticAvailable,
      }),
    ),
  );
}
