import { useId } from "react";

import { PetraCompactAction } from "../ui/PetraCompactAction";
import { PetraIcon } from "../ui/icons/PetraIcon";
import type { PetraIconName } from "../ui/icons/spec";
import type {
  InterventionTool,
  NormalizedDishPoint,
} from "../ui/interventionPreview";
import type { InterventionPlacementState } from "../ui/interventionPlacement";
import type { MotionPreference } from "../ui/motion/policy";
import { projectInterventionCapability } from "./interventionCapability";
import type { RuntimeUiStatus } from "./runtimeView";

const INTERVENTION_ICONS = {
  inoculate: "inoculate",
  fungus: "fungus",
  antibiotic: "antibiotic",
  nutrient: "nutrient",
} as const satisfies Readonly<Record<InterventionTool, PetraIconName>>;

export interface InterventionPaletteProps {
  readonly motion: MotionPreference;
  readonly runtimeStatus: RuntimeUiStatus;
  readonly placement?: InterventionPlacementState;
  readonly onBeginPlacement?: (tool: InterventionTool) => void;
  readonly onPlacementPointChange?: (point: NormalizedDishPoint) => void;
  readonly onCancelPlacement?: () => void;
}

export function InterventionPalette({
  motion,
  runtimeStatus,
  placement,
  onBeginPlacement,
  onPlacementPointChange,
  onCancelPlacement,
}: InterventionPaletteProps) {
  const reasonId = useId();
  const placementNoteId = useId();
  const view = projectInterventionCapability(runtimeStatus);
  const activeTool =
    placement?.phase === "placing" ? placement.tool : null;
  const activeToolLabel =
    activeTool === null
      ? null
      : view.tools.find(({ tool }) => tool === activeTool)?.label ?? activeTool;

  const updateAxis = (axis: "x" | "y", percentage: number) => {
    if (placement?.phase !== "placing") return;
    onPlacementPointChange?.({
      ...placement.point,
      [axis]: percentage / 100,
    });
  };

  return (
    <aside
      className="petra-panel petra-panel--tools"
      aria-label="Interventions"
      data-intervention-capability={view.reason}
      data-placement-active={activeTool === null ? "false" : "true"}
    >
      <p className="petra-kicker">Experiment tools</p>
      <h2>Add to Dish</h2>
      <p className="petra-panel__intro">
        Choose a population or condition to preview on the dish.
      </p>

      <div className="tool-stack" aria-describedby={reasonId}>
        {view.tools.map(({ tool, label }) => (
          <PetraCompactAction
            key={tool}
            motionPreference={motion}
            selected={activeTool === tool}
            disabled={!view.previewAvailable}
            aria-describedby={reasonId}
            aria-pressed={activeTool === tool}
            data-intervention-tool={tool}
            onClick={() => onBeginPlacement?.(tool)}
          >
            <span className="tool-action__icon" aria-hidden="true">
              <PetraIcon
                name={INTERVENTION_ICONS[tool]}
                decorative
                size={28}
              />
            </span>
            <span className="tool-action__copy">
              <strong>{label}</strong>
              <small>place preview</small>
            </span>
            <span className="tool-action__arrow" aria-hidden="true">
              ›
            </span>
          </PetraCompactAction>
        ))}
      </div>

      {placement?.phase === "placing" && activeTool !== null ? (
        <div className="intervention-placement-drawer">
          <div className="intervention-placement-drawer__heading">
            <span className="placement-preview-badge">Preview only</span>
            <strong>{activeToolLabel} target</strong>
          </div>

          <div className="placement-axis-controls">
            <PlacementAxis
              axis="x"
              label="Horizontal"
              value={placement.point.x}
              describedBy={placementNoteId}
              onChange={updateAxis}
            />
            <PlacementAxis
              axis="y"
              label="Vertical"
              value={placement.point.y}
              describedBy={placementNoteId}
              onChange={updateAxis}
            />
          </div>

          <p id={placementNoteId} className="placement-safety-note">
            The target ring is a visual cursor, not a predicted biological
            footprint. Dose, amount, units, and effect controls remain hidden
            until authoritative scenario metadata supplies them.
          </p>

          <div className="placement-drawer-actions">
            <PetraCompactAction
              motionPreference={motion}
              className="ghost-button"
              onClick={onCancelPlacement}
            >
              Cancel
            </PetraCompactAction>
            <PetraCompactAction
              motionPreference={motion}
              disabled
              aria-describedby={reasonId}
            >
              Apply unavailable
            </PetraCompactAction>
          </div>
        </div>
      ) : null}

      <p
        id={reasonId}
        className="panel-note"
        role={view.reason === "runtime-error" ? "alert" : "status"}
      >
        {view.message}
      </p>
    </aside>
  );
}

function PlacementAxis({
  axis,
  label,
  value,
  describedBy,
  onChange,
}: {
  readonly axis: "x" | "y";
  readonly label: string;
  readonly value: number;
  readonly describedBy: string;
  readonly onChange: (axis: "x" | "y", percentage: number) => void;
}) {
  const percentage = Math.round(value * 100);

  return (
    <label className="placement-axis">
      <span>
        {label}
        <output>{percentage}%</output>
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={percentage}
        aria-label={`${label} dish target position`}
        aria-describedby={describedBy}
        onChange={(event) => onChange(axis, Number(event.target.value))}
      />
    </label>
  );
}
