import type {
  CSSProperties,
  ReactElement,
} from "react";

import type { MotionPreference } from "../motion/policy";
import {
  cuesForProfile,
  resolveDemoPresenterPresentation,
  type DemoEvidenceGate,
  type DemoPresenterEvent,
  type DemoPresenterState,
  type DemoSurface,
} from "./presenter";
import "./PresenterGuide.css";

export interface PresenterGuideProps {
  readonly state: DemoPresenterState;
  readonly motionPreference: MotionPreference;
  readonly onEvent: (event: DemoPresenterEvent) => void;
}

export function PresenterGuide({
  state,
  motionPreference,
  onEvent,
}: PresenterGuideProps): ReactElement {
  const presentation = resolveDemoPresenterPresentation(state, motionPreference);
  const cues = cuesForProfile(state.profile);
  const style = {
    "--presenter-motion-ms": String(presentation.motion.durationMs) + "ms",
    "--presenter-ease":
      "cubic-bezier(" + presentation.easing.join(",") + ")",
  } as CSSProperties;

  return (
    <aside
      className="presenter-guide"
      data-profile={state.profile}
      data-motion={motionPreference}
      data-treatment={presentation.motion.treatment}
      data-surface={presentation.cue.surface}
      style={style}
      aria-labelledby="presenter-guide-title"
    >
      <header className="presenter-guide__header">
        <div>
          <p className="presenter-guide__kicker">Expo presenter mode</p>
          <h2 id="presenter-guide-title">
            {state.profile === "90-second" ? "90-second story" : "3-minute story"}
          </h2>
        </div>
        <label className="presenter-guide__profile">
          <span>Runbook</span>
          <select
            value={state.profile}
            aria-label="Presenter runbook"
            onChange={(event) =>
              onEvent({
                type: "set-profile",
                profile: event.currentTarget.value as DemoPresenterState["profile"],
              })
            }
          >
            <option value="90-second">90 seconds</option>
            <option value="3-minute">3 minutes</option>
          </select>
        </label>
      </header>

      <ol className="presenter-guide__rail" aria-label="Presenter cue progress">
        {cues.map((cue, index) => {
          const current = index === state.cueIndex && !state.completed;
          const complete = index < state.cueIndex || state.completed;
          return (
            <li
              key={cue.id}
              data-state={current ? "current" : complete ? "complete" : "future"}
              aria-current={current ? "step" : undefined}
            >
              <span>{index + 1}</span>
              <strong>{cue.title}</strong>
            </li>
          );
        })}
      </ol>

      <section className="presenter-guide__card" aria-live="polite">
        <div className="presenter-guide__meta">
          <span>
            Cue {presentation.cueNumber} / {presentation.cueCount}
          </span>
          <span>{formatTarget(presentation.elapsedTargetSeconds)} target</span>
          <span data-surface-hint={presentation.cue.surface}>
            Focus: {surfaceLabel(presentation.cue.surface)}
          </span>
        </div>

        <p className="presenter-guide__eyebrow">
          {presentation.cue.eyebrow}
        </p>
        <h3>{presentation.cue.title}</h3>
        <p className="presenter-guide__note">
          {presentation.cue.presenterNote}
        </p>

        <div className="presenter-guide__takeaway">
          <span aria-hidden="true">→</span>
          <div>
            <strong>Audience takeaway</strong>
            <p>{presentation.cue.audienceTakeaway}</p>
          </div>
        </div>

        <div className="presenter-guide__boundary" data-boundary="scientific">
          <strong>Scientific boundary</strong>
          <p>{presentation.cue.scientificBoundary}</p>
        </div>

        <GateStatus waitingFor={presentation.waitingFor} />

        <p className="presenter-guide__timing">
          Target times are presenter pacing only. They never advance the
          simulator or satisfy scientific evidence gates.
        </p>
      </section>

      <footer className="presenter-guide__actions">
        <button
          type="button"
          onClick={() => onEvent({ type: "back" })}
          disabled={state.cueIndex === 0 && !state.completed}
        >
          Back
        </button>
        <button
          type="button"
          className="presenter-guide__next"
          onClick={() => onEvent({ type: "next" })}
          disabled={!presentation.canAdvance}
          aria-describedby={
            presentation.waitingFor === null
              ? undefined
              : "presenter-guide-gate-status"
          }
        >
          {state.cueIndex >= cues.length - 1 ? "Finish" : "Next cue"}
        </button>
      </footer>
    </aside>
  );
}

function GateStatus({
  waitingFor,
}: {
  readonly waitingFor: DemoEvidenceGate | null;
}): ReactElement {
  if (waitingFor === null) {
    return (
      <div
        className="presenter-guide__gate presenter-guide__gate--ready"
        id="presenter-guide-gate-status"
      >
        <span aria-hidden="true">✓</span>
        <span>Required authoritative evidence is available.</span>
      </div>
    );
  }

  return (
    <div
      className="presenter-guide__gate presenter-guide__gate--waiting"
      id="presenter-guide-gate-status"
      role="status"
    >
      <span aria-hidden="true">◇</span>
      <span>{gateLabel(waitingFor)}</span>
    </div>
  );
}

function gateLabel(gate: DemoEvidenceGate): string {
  const labels: Readonly<Record<DemoEvidenceGate, string>> = {
    "runtime-ready": "Waiting for authoritative runtime state.",
    "growth-observed": "Waiting for authoritative growth evidence.",
    "intervention-recorded": "Waiting for the intervention to be recorded.",
    "selection-evidence-ready":
      "Waiting for authoritative lineage-frequency evidence.",
    "replay-evidence-ready": "Waiting for reproducible replay evidence.",
    "provenance-ready": "Waiting for authoritative provenance records.",
    "compare-ready": "Waiting for a verified shared-origin comparison.",
  };
  return labels[gate];
}

function surfaceLabel(surface: DemoSurface): string {
  const labels: Readonly<Record<DemoSurface, string>> = {
    dish: "live dish",
    controls: "intervention controls",
    timeline: "timeline",
    analysis: "analysis",
    sources: "Sources / Assumptions",
    compare: "counterfactual compare",
  };
  return labels[surface];
}

function formatTarget(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + ":" + String(remainder).padStart(2, "0");
}
