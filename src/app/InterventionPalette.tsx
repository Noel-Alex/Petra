import { useEffect, useId, useState } from "react";

import { PetraCompactAction } from "../ui/PetraCompactAction";
import { InterventionIllustration } from "./InterventionIllustration";
import type {
  InterventionTool,
  NormalizedDishPoint,
} from "../ui/interventionPreview";
import type { InterventionPlacementState } from "../ui/interventionPlacement";
import type { MotionPreference } from "../ui/motion/policy";
import { projectInterventionCapability } from "./interventionCapability";
import type { RuntimeUiStatus } from "./runtimeView";

const TOOL_COPY = {
  inoculate: {
    title: "Add population",
    detail: "Bacteria and other microbes",
  },
  fungus: {
    title: "Add fungi",
    detail: "Yeasts and filamentous fungi",
  },
  antibiotic: {
    title: "Add medicine",
    detail: "Antibiotics and antifungals",
  },
  nutrient: {
    title: "Add nutrient",
    detail: "Change the environment",
  },
} as const satisfies Readonly<
  Record<InterventionTool, { readonly title: string; readonly detail: string }>
>;

export interface InterventionPaletteProps {
  readonly motion: MotionPreference;
  readonly runtimeStatus: RuntimeUiStatus;
  readonly placement?: InterventionPlacementState;
  readonly ciprofloxacinMetadata?: unknown;
  readonly onBeginPlacement?: (tool: InterventionTool) => void;
  readonly onPlacementPointChange?: (point: NormalizedDishPoint) => void;
  readonly onCancelPlacement?: () => void;
  /**
   * Dispatches one already-authorized whole-dish ciprofloxacin request.
   * Returns true only when the authoritative runtime accepted the command.
   */
  readonly onApplyCiprofloxacinGlobal?: (
    concentrationMgPerL: number,
  ) => boolean;
}

export function InterventionPalette({
  motion,
  runtimeStatus,
  placement,
  ciprofloxacinMetadata = null,
  onBeginPlacement,
  onPlacementPointChange,
  onCancelPlacement,
  onApplyCiprofloxacinGlobal,
}: InterventionPaletteProps) {
  const reasonId = useId();
  const placementNoteId = useId();
  const view = projectInterventionCapability(
    runtimeStatus,
    ciprofloxacinMetadata,
  );
  const activeTool =
    placement?.phase === "placing" ? placement.tool : null;
  const activeToolLabel =
    activeTool === null ? null : TOOL_COPY[activeTool].title;
  const ciprofloxacinAuthority = view.ciprofloxacinAuthority;
  const [ciprofloxacinConcentration, setCiprofloxacinConcentration] =
    useState<number | null>(null);

  useEffect(() => {
    setCiprofloxacinConcentration(
      ciprofloxacinAuthority?.parameter.defaultValue ?? null,
    );
  }, [
    ciprofloxacinAuthority?.parameter.key,
    ciprofloxacinAuthority?.parameter.unit,
    ciprofloxacinAuthority?.parameter.minimum,
    ciprofloxacinAuthority?.parameter.maximum,
    ciprofloxacinAuthority?.parameter.defaultValue,
    ciprofloxacinAuthority?.parameter.precision,
  ]);

  const activeGlobalCiprofloxacin =
    activeTool === "antibiotic" &&
    ciprofloxacinAuthority?.supportedGeometries.includes("global") === true;
  const concentrationValue =
    ciprofloxacinConcentration ??
    ciprofloxacinAuthority?.parameter.defaultValue ??
    0;
  const concentrationInRange =
    ciprofloxacinAuthority !== null &&
    Number.isFinite(concentrationValue) &&
    concentrationValue >= ciprofloxacinAuthority.parameter.minimum &&
    concentrationValue <= ciprofloxacinAuthority.parameter.maximum;
  const canApplyGlobalCiprofloxacin =
    activeGlobalCiprofloxacin &&
    runtimeStatus === "ready" &&
    concentrationInRange &&
    onApplyCiprofloxacinGlobal !== undefined;

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
        {view.tools.map(({ tool }) => (
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
              <InterventionIllustration tool={tool} />
            </span>
            <span className="tool-action__copy">
              <strong>{TOOL_COPY[tool].title}</strong>
              <small>{TOOL_COPY[tool].detail}</small>
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
            <span className="placement-preview-badge">
              {activeGlobalCiprofloxacin ? "Authoritative" : "Preview only"}
            </span>
            <strong>
              {activeGlobalCiprofloxacin
                ? "Ciprofloxacin · whole dish"
                : `${activeToolLabel} target`}
            </strong>
          </div>

          {activeGlobalCiprofloxacin && ciprofloxacinAuthority !== null ? (
            <>
              <label className="placement-axis">
                <span>
                  {ciprofloxacinAuthority.parameter.label}
                  <output>
                    {concentrationValue.toFixed(
                      ciprofloxacinAuthority.parameter.precision,
                    )}{" "}
                    {ciprofloxacinAuthority.parameter.unit}
                  </output>
                </span>
                <input
                  type="range"
                  min={ciprofloxacinAuthority.parameter.minimum}
                  max={ciprofloxacinAuthority.parameter.maximum}
                  step={
                    10 ** -ciprofloxacinAuthority.parameter.precision
                  }
                  value={concentrationValue}
                  aria-label={ciprofloxacinAuthority.parameter.label}
                  aria-describedby={placementNoteId}
                  onChange={(event) =>
                    setCiprofloxacinConcentration(
                      Number(event.target.value),
                    )
                  }
                />
              </label>

              <p id={placementNoteId} className="placement-safety-note">
                This applies the scenario-authorized model concentration field
                to the whole dish. It is not a clinical dose or a physical
                delivery/diffusion model.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="placement-drawer-actions">
            <PetraCompactAction
              motionPreference={motion}
              className="ghost-button"
              onClick={onCancelPlacement}
            >
              Cancel
            </PetraCompactAction>
            {activeGlobalCiprofloxacin ? (
              <PetraCompactAction
                motionPreference={motion}
                disabled={!canApplyGlobalCiprofloxacin}
                aria-describedby={reasonId}
                onClick={() => {
                  if (!canApplyGlobalCiprofloxacin) return;
                  onApplyCiprofloxacinGlobal?.(concentrationValue);
                }}
              >
                Apply to whole dish
              </PetraCompactAction>
            ) : (
              <PetraCompactAction
                motionPreference={motion}
                disabled
                aria-describedby={reasonId}
              >
                Apply unavailable
              </PetraCompactAction>
            )}
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
