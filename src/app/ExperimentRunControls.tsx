import {
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";

import { MAX_SIMULATION_SEED } from "../sim/protocol";
import {
  PLAYBACK_SPEEDS,
  type ExperimentControlAction,
} from "../ui/experimentControls";
import { playbackSpeedShortcut } from "../ui/keyboard";
import type { MotionPreference } from "../ui/motion/policy";
import { PetraCompactAction } from "../ui/PetraCompactAction";
import type { ExperimentRuntimeBinding } from "./useExperimentRuntime";
import type { ExperimentRuntimeView } from "./runtimeView";
import {
  dispatchFailureMessage,
  parseSeedDraft,
} from "./runControls";
import "./ExperimentRunControls.css";

export interface ExperimentRunControlsProps {
  readonly motion: MotionPreference;
  readonly view: ExperimentRuntimeView;
  readonly dispatch: ExperimentRuntimeBinding["dispatch"];
}

/**
 * Typed run-management surface. React owns only draft/feedback presentation;
 * every simulation effect still routes through ExperimentRuntime.dispatch().
 */
export function ExperimentRunControls({
  motion,
  view,
  dispatch,
}: ExperimentRunControlsProps) {
  const feedbackId = useId();
  const [seedDraft, setSeedDraft] = useState(
    () => view.runControls.seed?.toString() ?? "",
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSeedDraft(view.runControls.seed?.toString() ?? "");
    setFeedback(null);
  }, [view.runControls.seed]);

  const dispatchAction = (action: ExperimentControlAction) => {
    setFeedback(dispatchFailureMessage(dispatch(action)));
  };

  const submitSeed = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseSeedDraft(seedDraft);
    if (parsed.error !== null || parsed.seed === null) {
      setFeedback(parsed.error);
      return;
    }

    dispatchAction({ type: "set-seed", seed: parsed.seed });
  };

  const seedLabel =
    view.runControls.seed === null
      ? "Seed —"
      : `Seed ${view.runControls.seed}`;

  return (
    <section
      className="experiment-run-controls"
      aria-label="Run controls"
      data-run-controls-status={view.status}
    >
      <div className="experiment-run-controls__primary">
        <PetraCompactAction
          motionPreference={motion}
          disabled={!view.canTogglePlayback}
          aria-keyshortcuts="Space"
          onClick={() => {
            dispatchAction({
              type: view.playing ? "pause" : "play",
            });
          }}
        >
          {view.playing ? "Pause" : "Play"}
        </PetraCompactAction>

        <PetraCompactAction
          motionPreference={motion}
          disabled={!view.runControls.canStep}
          aria-keyshortcuts="."
          onClick={() => {
            dispatchAction({ type: "step", ticks: 1 });
          }}
        >
          Step
        </PetraCompactAction>

        {PLAYBACK_SPEEDS.map((speed) => (
          <PetraCompactAction
            key={speed}
            motionPreference={motion}
            selected={view.speed === speed}
            disabled={!view.canChangeSpeed}
            aria-keyshortcuts={playbackSpeedShortcut(speed)}
            onClick={() => {
              dispatchAction({ type: "set-speed", speed });
            }}
          >
            {speed}×
          </PetraCompactAction>
        ))}

        <PetraCompactAction
          motionPreference={motion}
          disabled={!view.runControls.canReset}
          onClick={() => {
            dispatchAction({ type: "reset" });
          }}
        >
          Reset
        </PetraCompactAction>

        <PetraCompactAction
          motionPreference={motion}
          disabled={!view.runControls.canReplay}
          onClick={() => {
            dispatchAction({ type: "replay" });
          }}
        >
          Replay
        </PetraCompactAction>
      </div>

      <form className="seed-control" onSubmit={submitSeed}>
        <label>
          <span>New run seed</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SIMULATION_SEED}
            step={1}
            value={seedDraft}
            disabled={!view.runControls.canSetSeed}
            aria-describedby={feedbackId}
            aria-invalid={feedback !== null ? true : undefined}
            onChange={(event) => {
              setSeedDraft(event.target.value);
              if (feedback !== null) setFeedback(null);
            }}
          />
        </label>
        <PetraCompactAction
          type="submit"
          motionPreference={motion}
          disabled={!view.runControls.canSetSeed}
        >
          New seed run
        </PetraCompactAction>
      </form>

      <p className="experiment-run-controls__identity" role="note">
        {seedLabel} · Replay history {view.runControls.acceptedCommandCount}{" "}
        accepted command{view.runControls.acceptedCommandCount === 1 ? "" : "s"}.
        Reset keeps this seed; applying a seed starts a fresh run.
      </p>

      <p
        id={feedbackId}
        className="experiment-run-controls__feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback ?? ""}
      </p>
    </section>
  );
}
