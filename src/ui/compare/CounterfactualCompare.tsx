import {
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  synchronizeCompareCursor,
  type CounterfactualBranch,
} from "../counterfactual";
import { PetraCompactAction } from "../PetraCompactAction";
import type { MotionPreference } from "../motion/policy";
import {
  normalizeSwipePercent,
  resolveComparePresentation,
  type CompareViewMode,
} from "./presentation";
import {
  resolveTimeBoundCompareSurface,
  type ResolvedTimeBoundCompareSurface,
  type TimeBoundCompareSurface,
} from "./timeBoundSurface";
import "./CounterfactualCompare.css";

export interface CounterfactualCompareProps {
  readonly left: CounterfactualBranch;
  readonly right: CounterfactualBranch;
  readonly leftSurface: TimeBoundCompareSurface<ReactNode>;
  readonly rightSurface: TimeBoundCompareSurface<ReactNode>;
  readonly requestedTimeHours: number;
  readonly leftAvailableThroughHours: number;
  readonly rightAvailableThroughHours: number;
  readonly motionPreference: MotionPreference;
  readonly initialMode?: CompareViewMode;
  readonly initialSwipePercent?: number;
}

/**
 * Accessible presentation shell for already-authoritative counterfactual views.
 *
 * Supplied scientific surfaces must carry exact authoritative branch/time
 * identity. The shell validates that identity before it renders their content.
 */
export function CounterfactualCompare({
  left,
  right,
  leftSurface,
  rightSurface,
  requestedTimeHours,
  leftAvailableThroughHours,
  rightAvailableThroughHours,
  motionPreference,
  initialMode = "side-by-side",
  initialSwipePercent = 50,
}: CounterfactualCompareProps) {
  const [mode, setMode] = useState<CompareViewMode>(initialMode);
  const [swipePercent, setSwipePercent] = useState(() =>
    normalizeSwipePercent(initialSwipePercent),
  );

  const presentation = useMemo(
    () => resolveComparePresentation(left, right, mode, motionPreference),
    [left, right, mode, motionPreference],
  );

  const cursor = useMemo(
    () =>
      synchronizeCompareCursor(
        requestedTimeHours,
        leftAvailableThroughHours,
        rightAvailableThroughHours,
      ),
    [requestedTimeHours, leftAvailableThroughHours, rightAvailableThroughHours],
  );

  const boundLeft = useMemo(
    () =>
      resolveTimeBoundCompareSurface({
        expectedBranchId: left.branchId,
        expectedTimeHours: cursor.leftTimeHours,
        surface: leftSurface,
      }),
    [cursor.leftTimeHours, left.branchId, leftSurface],
  );

  const boundRight = useMemo(
    () =>
      resolveTimeBoundCompareSurface({
        expectedBranchId: right.branchId,
        expectedTimeHours: cursor.rightTimeHours,
        surface: rightSurface,
      }),
    [cursor.rightTimeHours, right.branchId, rightSurface],
  );

  const hasSurfaceMismatch =
    boundLeft.status === "mismatch" || boundRight.status === "mismatch";

  const easing = `cubic-bezier(${presentation.easing.join(", ")})`;
  const storyCue = presentation.storyMoment?.cues.find((cue) => cue.essential);
  const storyEasing =
    storyCue === undefined
      ? "linear"
      : `cubic-bezier(${storyCue.easing.join(", ")})`;
  const style = {
    "--compare-motion-ms": `${presentation.layoutMotion.durationMs}ms`,
    "--compare-easing": easing,
    "--compare-story-motion-ms": `${storyCue?.durationMs ?? 0}ms`,
    "--compare-story-easing": storyEasing,
    "--compare-swipe": `${swipePercent}%`,
  } as CSSProperties;

  return (
    <section
      className="petra-compare"
      data-mode={mode}
      data-motion-treatment={presentation.layoutMotion.treatment}
      data-tone={presentation.tone}
      data-story-moment={presentation.storyMoment?.kind ?? "none"}
      data-story-treatment={storyCue?.treatment ?? "instant"}
      style={style}
      aria-label="Counterfactual branch comparison"
    >
      <header className="petra-compare__header">
        <div>
          <p className="petra-compare__eyebrow">Counterfactual experiment</p>
          <h2>Compare the same moment, not the same animation frame.</h2>
        </div>

        <div
          className="petra-compare__mode"
          role="group"
          aria-label="Comparison layout"
        >
          <PetraCompactAction
            className="petra-compare__mode-action"
            motionPreference={motionPreference}
            selected={mode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
          >
            Side by side
          </PetraCompactAction>
          <PetraCompactAction
            className="petra-compare__mode-action"
            motionPreference={motionPreference}
            selected={mode === "swipe"}
            onClick={() => setMode("swipe")}
          >
            Swipe
          </PetraCompactAction>
        </div>
      </header>

      <div
        className="petra-compare__meaning"
        role="status"
        aria-live="polite"
        data-tone={presentation.tone}
      >
        <span
          className="petra-compare__meaning-mark"
          data-story-visual={storyCue?.visual ?? "none"}
          aria-hidden="true"
        />
        <div>
          <strong>{presentation.headline}</strong>
          <p>{presentation.detail}</p>
        </div>
      </div>

      <div className="petra-compare__stage" data-mode={mode}>
        <ComparePane side="left" branch={left} surface={boundLeft} />

        <ComparePane side="right" branch={right} surface={boundRight} />

        {mode === "swipe" ? (
          <>
            <div className="petra-compare__divider" aria-hidden="true">
              <span />
            </div>
            <label className="petra-compare__reveal">
              <span>Reveal right branch</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={swipePercent}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSwipePercent(
                    normalizeSwipePercent(event.currentTarget.valueAsNumber),
                  )
                }
                aria-label="Reveal right branch"
              />
            </label>
          </>
        ) : null}
      </div>

      <footer className="petra-compare__footer">
        <span>
          Requested biological time:{" "}
          <strong>{formatHours(cursor.requestedTimeHours)}</strong>
        </span>
        {hasSurfaceMismatch ? (
          <span className="petra-compare__surface-mismatch">
            A supplied scientific surface did not match its synchronized
            branch/time identity and was withheld.
          </span>
        ) : cursor.isClamped ? (
          <span className="petra-compare__clamped">
            One branch has not simulated that far; each pane shows only
            authoritative state that exists.
          </span>
        ) : (
          <span>Both panes are synchronized to the same biological time.</span>
        )}
      </footer>
    </section>
  );
}

interface ComparePaneProps {
  readonly side: "left" | "right";
  readonly branch: CounterfactualBranch;
  readonly surface: ResolvedTimeBoundCompareSurface<ReactNode>;
}

function ComparePane({ side, branch, surface }: ComparePaneProps) {
  const identity = surface.surface.identity;
  return (
    <article
      className={`petra-compare__pane petra-compare__pane--${side}`}
      aria-label={`${side === "left" ? "Left" : "Right"} branch: ${branch.label}`}
    >
      <header className="petra-compare__pane-header">
        <div>
          <span>{side === "left" ? "A" : "B"}</span>
          <strong>{branch.label}</strong>
        </div>
        <dl>
          <div>
            <dt>Seed</dt>
            <dd>{branch.seed}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {surface.status === "ready"
                ? formatHours(identity.simulationTimeHours)
                : "Unavailable"}
            </dd>
          </div>
        </dl>
      </header>
      <div
        className="petra-compare__surface"
        data-surface-status={surface.status}
        data-sample-id={identity.sampleId}
        data-surface-time-hours={identity.simulationTimeHours}
      >
        {surface.status === "ready" ? (
          surface.surface.content
        ) : (
          <div className="petra-compare__surface-warning" role="alert">
            <strong>Scientific surface withheld</strong>
            <span>{surface.warning}</span>
            <small>
              Expected {surface.expectedBranchId} at{" "}
              {formatHours(surface.expectedTimeHours)}; supplied sample{" "}
              {identity.sampleId} at {formatHours(identity.simulationTimeHours)}.
            </small>
          </div>
        )}
      </div>
    </article>
  );
}

function formatHours(hours: number): string {
  return `${hours.toFixed(2)} h`;
}
