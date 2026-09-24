import {
  useId,
  type ChangeEvent,
  type ReactElement,
} from "react";

import type {
  AuthoritativeHistoryIndex,
  HistoricalStateResolution,
} from "./historicalState";

import "./historicalScrubControl.css";

export type HistoricalScrubPosition =
  | {
      readonly kind: "authoritative";
      readonly stateAuthority: "authoritative";
      readonly commandCount: number;
      readonly simulationTimeHours: number;
    }
  | {
      readonly kind: "between-authority";
      readonly stateAuthority: "presentation-only";
      readonly lowerCommandCount: number;
      readonly upperCommandCount: number;
      readonly lowerSimulationTimeHours: number;
      readonly upperSimulationTimeHours: number;
      readonly progress: number;
    };

export interface HistoricalScrubPlan {
  readonly firstCommandCount: number;
  readonly lastCommandCount: number;
  readonly requestedCommandPosition: number;
  readonly position: HistoricalScrubPosition;
}

export interface HistoricalScrubControlProps {
  readonly history: AuthoritativeHistoryIndex;
  readonly requestedCommandPosition: number;
  readonly onRequestedCommandPositionChange: (commandPosition: number) => void;
  readonly disabled?: boolean;
  readonly label?: string;
}

export interface HistoricalScrubKeyEvent {
  readonly key: string;
  stopPropagation(): void;
}

const RANGE_NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  " ",
  "Spacebar",
]);

/**
 * Keeps native range navigation local to the scrubber without changing the
 * browser's range behavior. This prevents App-level playback shortcuts from
 * interpreting a scrub gesture as a runtime command.
 */
export function keepHistoricalScrubNavigationLocal(
  event: HistoricalScrubKeyEvent,
): void {
  if (RANGE_NAVIGATION_KEYS.has(event.key)) {
    event.stopPropagation();
  }
}

function assertSafeCommandCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function validateResolution(
  resolution: HistoricalStateResolution,
  requestedCommandPosition: number,
): HistoricalScrubPosition {
  if (resolution.requestedCommandPosition !== requestedCommandPosition) {
    throw new Error(
      "historical scrub resolution does not match the requested command position",
    );
  }

  if (resolution.kind === "authoritative") {
    const checkpoint = resolution.keyframe.snapshot.checkpoint;
    assertSafeCommandCount("authoritative commandCount", checkpoint.commandCount);
    if (checkpoint.commandCount !== requestedCommandPosition) {
      throw new Error(
        "historical scrub exact authority must match the requested command position",
      );
    }
    if (
      !Number.isFinite(checkpoint.simulationTimeHours) ||
      checkpoint.simulationTimeHours < 0
    ) {
      throw new RangeError(
        "historical scrub biological time must be finite and non-negative",
      );
    }

    return Object.freeze({
      kind: "authoritative",
      stateAuthority: "authoritative",
      commandCount: checkpoint.commandCount,
      simulationTimeHours: checkpoint.simulationTimeHours,
    });
  }

  if (resolution.stateAuthority !== "presentation-only") {
    throw new Error(
      "between-keyframe historical scrub state must remain presentation-only",
    );
  }

  const lower = resolution.lower.snapshot.checkpoint;
  const upper = resolution.upper.snapshot.checkpoint;
  assertSafeCommandCount("lower commandCount", lower.commandCount);
  assertSafeCommandCount("upper commandCount", upper.commandCount);
  if (
    lower.commandCount >= requestedCommandPosition ||
    upper.commandCount <= requestedCommandPosition
  ) {
    throw new Error(
      "historical scrub presentation cursor must lie strictly between authority bounds",
    );
  }
  if (
    !Number.isFinite(lower.simulationTimeHours) ||
    lower.simulationTimeHours < 0 ||
    !Number.isFinite(upper.simulationTimeHours) ||
    upper.simulationTimeHours < lower.simulationTimeHours
  ) {
    throw new RangeError(
      "historical scrub biological-time bounds must be finite, non-negative, and ordered",
    );
  }
  if (
    !Number.isFinite(resolution.progress) ||
    resolution.progress <= 0 ||
    resolution.progress >= 1
  ) {
    throw new RangeError(
      "historical scrub presentation progress must be within (0, 1)",
    );
  }

  return Object.freeze({
    kind: "between-authority",
    stateAuthority: "presentation-only",
    lowerCommandCount: lower.commandCount,
    upperCommandCount: upper.commandCount,
    lowerSimulationTimeHours: lower.simulationTimeHours,
    upperSimulationTimeHours: upper.simulationTimeHours,
    progress: resolution.progress,
  });
}

/**
 * Build a fail-closed view of one requested accepted-command position.
 *
 * The visible control intentionally advances in integer accepted-command
 * positions. A missing recorded checkpoint at that position remains
 * presentation-only through AuthoritativeHistoryIndex.resolve(); this helper
 * never synthesizes an authoritative state or biological timestamp.
 */
export function planHistoricalScrubControl(
  history: AuthoritativeHistoryIndex,
  requestedCommandPosition: number,
): HistoricalScrubPlan {
  assertSafeCommandCount("history firstCommandCount", history.firstCommandCount);
  assertSafeCommandCount("history lastCommandCount", history.lastCommandCount);
  assertSafeCommandCount(
    "requested historical command position",
    requestedCommandPosition,
  );
  if (history.firstCommandCount > history.lastCommandCount) {
    throw new Error("historical scrub bounds are reversed");
  }
  if (
    requestedCommandPosition < history.firstCommandCount ||
    requestedCommandPosition > history.lastCommandCount
  ) {
    throw new RangeError(
      "requested historical command position must lie within recorded history bounds",
    );
  }

  const resolution = history.resolve(requestedCommandPosition);
  const position = validateResolution(resolution, requestedCommandPosition);

  return Object.freeze({
    firstCommandCount: history.firstCommandCount,
    lastCommandCount: history.lastCommandCount,
    requestedCommandPosition,
    position,
  });
}

function formatHours(value: number): string {
  return `${value.toFixed(2)} h`;
}

/**
 * Native accessible scrub control over historical presentation state.
 *
 * This component requests a cursor only. It cannot restore a Worker, mutate
 * the live run, or promote between-keyframe presentation into scientific
 * authority.
 */
export function HistoricalScrubControl({
  history,
  requestedCommandPosition,
  onRequestedCommandPositionChange,
  disabled = false,
  label = "Inspect historical state",
}: HistoricalScrubControlProps): ReactElement {
  const plan = planHistoricalScrubControl(
    history,
    requestedCommandPosition,
  );
  const id = useId();
  const rangeId = `historical-scrub-${id}`;
  const statusId = `${rangeId}-status`;
  const detailId = `${rangeId}-detail`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    assertSafeCommandCount("historical scrub input value", next);
    if (next < plan.firstCommandCount || next > plan.lastCommandCount) {
      throw new RangeError(
        "historical scrub input value must remain within recorded history bounds",
      );
    }
    onRequestedCommandPositionChange(next);
  };

  return (
    <fieldset className="historical-scrub" disabled={disabled}>
      <legend>{label}</legend>

      <div className="historical-scrub__range-row">
        <span aria-hidden="true">{plan.firstCommandCount}</span>
        <input
          id={rangeId}
          className="historical-scrub__range"
          type="range"
          min={plan.firstCommandCount}
          max={plan.lastCommandCount}
          step={1}
          value={plan.requestedCommandPosition}
          aria-label="Historical accepted-command position"
          aria-describedby={`${statusId} ${detailId}`}
          onChange={handleChange}
          onKeyDown={keepHistoricalScrubNavigationLocal}
        />
        <span aria-hidden="true">{plan.lastCommandCount}</span>
      </div>

      <output
        className="historical-scrub__status"
        id={statusId}
        htmlFor={rangeId}
      >
        {plan.position.kind === "authoritative" ? (
          <>
            <strong>Authoritative checkpoint</strong>
            <span>
              Command {plan.position.commandCount} ·{" "}
              {formatHours(plan.position.simulationTimeHours)}
            </span>
          </>
        ) : (
          <>
            <strong>Presentation-only cursor</strong>
            <span>
              Command {plan.requestedCommandPosition} between authoritative
              commands {plan.position.lowerCommandCount} and{" "}
              {plan.position.upperCommandCount}
            </span>
          </>
        )}
      </output>

      <p className="historical-scrub__detail" id={detailId}>
        {plan.position.kind === "authoritative"
          ? "Dish, charts, inspector, and time may use this exact recorded checkpoint when wired to the same historical frame."
          : `Biological time is bounded by ${formatHours(
              plan.position.lowerSimulationTimeHours,
            )}–${formatHours(
              plan.position.upperSimulationTimeHours,
            )}. No scientific state or biological time is interpolated.`}
      </p>
    </fieldset>
  );
}
