import {
  useId,
  type CSSProperties,
  type ReactElement,
} from "react";

import { PetraIcon } from "../icons/PetraIcon";
import type { PetraIconName } from "../icons/spec";
import type { MotionPreference } from "../motion/policy";
import {
  ONBOARDING_STAGES,
  canContinue,
  currentStage,
  resolveOnboardingPresentation,
  type OnboardingEvent,
  type OnboardingState,
  type OnboardingStage,
} from "./story";

import "./OnboardingGuide.css";

export type OnboardingGuideAction = Extract<
  OnboardingEvent,
  { readonly type: "continue" | "back" | "skip" }
>;

export interface OnboardingGuideProps {
  readonly state: OnboardingState;
  readonly motionPreference: MotionPreference;
  readonly onAction: (event: OnboardingGuideAction) => void;
  readonly className?: string;
  readonly showSkip?: boolean;
}

/**
 * Premium presentation adapter over the canonical science-gated onboarding state.
 *
 * This component cannot satisfy scientific gates. Runtime/worker adapters own
 * those events and pass the resulting state back into this controlled view.
 */
export function OnboardingGuide({
  state,
  motionPreference,
  onAction,
  className,
  showSkip = true,
}: OnboardingGuideProps): ReactElement | null {
  const headingId = useId();
  const statusId = useId();

  if (state.completed) return null;
  const stage = currentStage(state);
  const presentation = resolveOnboardingPresentation(state, motionPreference);
  const ready = canContinue(state);
  const progress = (state.index + 1) / ONBOARDING_STAGES.length;

  const style = {
    "--onboarding-motion-ms": `${presentation.motion.durationMs}ms`,
    "--onboarding-easing": `cubic-bezier(${presentation.easing.join(", ")})`,
    "--onboarding-progress": progress,
    "--onboarding-ambient-primary-ms":
      `${presentation.ambient.primaryDrift.motion.durationMs}ms`,
    "--onboarding-ambient-primary-easing":
      `cubic-bezier(${presentation.ambient.primaryDrift.easing.join(", ")})`,
    "--onboarding-ambient-secondary-ms":
      `${presentation.ambient.secondaryDrift.motion.durationMs}ms`,
    "--onboarding-ambient-secondary-easing":
      `cubic-bezier(${presentation.ambient.secondaryDrift.easing.join(", ")})`,
    "--onboarding-focus-orbit-ms":
      `${presentation.ambient.focusOrbit.motion.durationMs}ms`,
    "--onboarding-focus-orbit-easing":
      `cubic-bezier(${presentation.ambient.focusOrbit.easing.join(", ")})`,
  } as CSSProperties;

  return (
    <section
      className={["petra-onboarding", className].filter(Boolean).join(" ")}
      data-focus={stage.focus}
      data-motion={motionPreference}
      data-motion-treatment={presentation.motion.treatment}
      data-ambient-motion={
        presentation.ambient.primaryDrift.motion.loops &&
        presentation.ambient.secondaryDrift.motion.loops &&
        presentation.ambient.focusOrbit.motion.loops
          ? "animate"
          : "static"
      }
      aria-labelledby={headingId}
      aria-describedby={statusId}
      style={style}
    >
      <div className="petra-onboarding__ambient" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="petra-onboarding__header">
        <div>
          <p className="petra-onboarding__kicker">Guided experiment</p>
          <p className="petra-onboarding__counter">
            {state.index + 1} / {ONBOARDING_STAGES.length}
          </p>
        </div>
        {showSkip ? (
          <button
            type="button"
            className="petra-onboarding__skip"
            onClick={() => onAction({ type: "skip" })}
          >
            Skip guide
          </button>
        ) : null}
      </header>

      <ol className="petra-onboarding__rail" aria-label="Guided experiment progress">
        {ONBOARDING_STAGES.map((candidate, index) => {
          const relation =
            index < state.index
              ? "complete"
              : index === state.index
                ? "current"
                : "upcoming";

          return (
            <li
              key={candidate.id}
              data-stage-state={relation}
              aria-current={relation === "current" ? "step" : undefined}
              title={candidate.title}
            >
              <span className="petra-onboarding__rail-mark" aria-hidden="true">
                {relation === "complete" ? "✓" : index + 1}
              </span>
              <span className="petra-onboarding__rail-label">
                {shortStageLabel(candidate)}
              </span>
            </li>
          );
        })}
      </ol>

      <article
        key={stage.id}
        className="petra-onboarding__story"
        data-causal={stage.causal ? "true" : "false"}
      >
        <div className="petra-onboarding__focus" aria-hidden="true">
          <span className="petra-onboarding__focus-orbit" />
          <span className="petra-onboarding__focus-core">
            <PetraIcon name={focusIcon(stage)} decorative size={28} />
          </span>
        </div>

        <div className="petra-onboarding__copy">
          <div className="petra-onboarding__eyebrow-row">
            <p>{stage.eyebrow}</p>
            <span>{focusLabel(stage)}</span>
          </div>
          <h2 id={headingId}>{stage.title}</h2>
          <p className="petra-onboarding__explanation">{stage.explanation}</p>
        </div>
      </article>

      <div
        id={statusId}
        className="petra-onboarding__gate"
        data-gate-state={ready ? "ready" : "waiting"}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="petra-onboarding__gate-mark" aria-hidden="true" />
        <div>
          <strong>{ready ? readyLabel(stage) : "Waiting for simulation evidence"}</strong>
          <span>
            {ready
              ? readyDetail(stage)
              : "This causal beat stays locked until authoritative simulator state satisfies its scientific gate."}
          </span>
        </div>
      </div>

      <footer className="petra-onboarding__actions">
        <button
          type="button"
          className="petra-onboarding__back"
          disabled={state.index === 0}
          onClick={() => onAction({ type: "back" })}
        >
          Back
        </button>
        <div className="petra-onboarding__progress" aria-hidden="true">
          <span />
        </div>
        <button
          type="button"
          className="petra-onboarding__continue"
          disabled={!ready}
          onClick={() => onAction({ type: "continue" })}
        >
          {stage.id === "handoff" ? "Start experimenting" : "Continue"}
        </button>
      </footer>
    </section>
  );
}

function focusIcon(stage: OnboardingStage): PetraIconName {
  switch (stage.focus) {
    case "dish":
      return "visual";
    case "population":
      return "lineage";
    case "pressure":
      return "intervention";
    case "lineage":
      return "lineage";
    case "controls":
      return "inspect";
  }
}

function focusLabel(stage: OnboardingStage): string {
  switch (stage.focus) {
    case "dish":
      return "Whole dish";
    case "population":
      return "Population";
    case "pressure":
      return "Pressure field";
    case "lineage":
      return "Lineages";
    case "controls":
      return "Your controls";
  }
}

function shortStageLabel(stage: OnboardingStage): string {
  switch (stage.id) {
    case "ecosystem":
      return "Observe";
    case "inoculation":
      return "Seed";
    case "growth":
      return "Grow";
    case "pressure":
      return "Pressure";
    case "selection":
      return "Selection";
    case "handoff":
      return "Experiment";
  }
}

function readyLabel(stage: OnboardingStage): string {
  return stage.causal ? "Authoritative gate satisfied" : "Ready to continue";
}

function readyDetail(stage: OnboardingStage): string {
  if (stage.id === "handoff") {
    return "The guide can leave the stage; the same simulator and provenance remain in control.";
  }

  return stage.causal
    ? "The story may advance because the required simulator evidence is already present."
    : "This presentation beat does not require a biological event.";
}
