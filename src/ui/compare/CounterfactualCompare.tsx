import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  synchronizeCompareCursor,
  type CounterfactualBranch,
} from "../counterfactual";
import type { MotionPreference } from "../motion/policy";
import {
  normalizeSwipePercent,
  resolveComparePresentation,
  type CompareViewMode,
} from "./presentation";
import "./CounterfactualCompare.css";

export interface CounterfactualCompareProps {
  readonly left: CounterfactualBranch;
  readonly right: CounterfactualBranch;
  readonly leftSurface: ReactNode;
  readonly rightSurface: ReactNode;
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
 * The supplied surfaces own no scientific truth here. This component only
 * arranges them, reveals them, and describes the existing branch identity.
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

  const easing = `cubic-bezier(${presentation.easing.join(", ")})`;
  const style = {
    "--compare-motion-ms": `${presentation.layoutMotion.durationMs}ms`,
    "--compare-easing": easing,
    "--compare-swipe": `${swipePercent}%`,
  } as CSSProperties;

  return (
    <section
      className="petra-compare"
      data-mode={mode}
      data-motion-treatment={presentation.layoutMotion.treatment}
      data-tone={presentation.tone}
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
          <button
            type="button"
            aria-pressed={mode === "side-by-side"}
            onClick={() => setMode("side-by-side")}
          >
            Side by side
          </button>
          <button
            type="button"
            aria-pressed={mode === "swipe"}
            onClick={() => setMode("swipe")}
          >
            Swipe
          </button>
        </div>
      </header>

      <div
        className="petra-compare__meaning"
        role="status"
        aria-live="polite"
        data-tone={presentation.tone}
      >
        <span className="petra-compare__meaning-mark" aria-hidden="true" />
        <div>
          <strong>{presentation.headline}</strong>
          <p>{presentation.detail}</p>
        </div>
      </div>

      <div className="petra-compare__stage" data-mode={mode}>
        <ComparePane
          side="left"
          branch={left}
          simulationTimeHours={cursor.leftTimeHours}
        >
          {leftSurface}
        </ComparePane>

        <ComparePane
          side="right"
          branch={right}
          simulationTimeHours={cursor.rightTimeHours}
        >
          {rightSurface}
        </ComparePane>

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
                onChange={(event) =>
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
        {cursor.isClamped ? (
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
  readonly simulationTimeHours: number;
  readonly children: ReactNode;
}

function ComparePane({
  side,
  branch,
  simulationTimeHours,
  children,
}: ComparePaneProps) {
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
            <dd>{formatHours(simulationTimeHours)}</dd>
          </div>
        </dl>
      </header>
      <div className="petra-compare__surface">{children}</div>
    </article>
  );
}

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }

  return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`;
}
