import type { InterventionTool } from "../ui/interventionPreview";
import type { RuntimeUiStatus } from "./runtimeView";

export type InterventionUnavailableReason =
  | "runtime-unavailable"
  | "runtime-starting"
  | "runtime-pending"
  | "runtime-error"
  | "authoritative-schema-unavailable";

export interface InterventionToolAvailability {
  readonly tool: InterventionTool;
  readonly label: string;
  readonly available: false;
}

export interface InterventionCapabilityView {
  readonly available: false;
  /** Placement-only preview may be enabled without granting simulation authority. */
  readonly previewAvailable: boolean;
  readonly reason: InterventionUnavailableReason;
  readonly message: string;
  readonly tools: readonly InterventionToolAvailability[];
}

const TOOLS = Object.freeze([
  { tool: "inoculate", label: "Inoculate", available: false },
  { tool: "fungus", label: "Fungi", available: false },
  { tool: "antibiotic", label: "Antibiotic", available: false },
  { tool: "nutrient", label: "Nutrient", available: false },
] as const satisfies readonly InterventionToolAvailability[]);

export function projectInterventionCapability(
  runtimeStatus: RuntimeUiStatus,
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
      return unavailable(
        "authoritative-schema-unavailable",
        "Placement preview is available, but the current protocol does not expose authoritative intervention commands. Petra will not substitute synthetic commands.",
        true,
      );
  }
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
    tools: TOOLS,
  };
}
