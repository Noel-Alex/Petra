import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PLAYBACK_SPEEDS } from "../ui/experimentControls";
import {
  loadMotionSetting,
  parseMotionSetting,
  resolveMotionSetting,
  saveMotionSetting,
  type MotionSetting,
} from "../ui/motion/preference";
import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import { ProvenancePanel } from "../ui/provenance/ProvenancePanel";
import { DishViewport } from "./DishViewport";
import { buildFlagshipProvenanceView } from "./flagshipProvenance";
import { surfaceMotionCss } from "./motionAdapter";
import {
  useExperimentRuntime,
  type ExperimentRuntimeFactory,
} from "./useExperimentRuntime";

function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (query === undefined) return;

    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export interface AppProps {
  readonly runtimeFactory?: ExperimentRuntimeFactory;
}

export function App({ runtimeFactory }: AppProps) {
  const systemReduced = useSystemReducedMotion();
  const experiment = useExperimentRuntime(runtimeFactory);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [motionSetting, setMotionSetting] = useState<MotionSetting>(() => {
    try {
      return loadMotionSetting(globalThis.localStorage);
    } catch {
      return "system";
    }
  });
  const provenance = useMemo(() => buildFlagshipProvenanceView(), []);

  const motionPreference = resolveMotionSetting({
    setting: motionSetting,
    prefersReducedMotion: systemReduced,
  });

  const panelMotion = useMemo(
    () =>
      surfaceMotionCss(
        planSurfaceTransition({
          surface: "panel",
          action: "show",
          preference: motionPreference,
        }),
      ),
    [motionPreference],
  );

  return (
    <main
      className="petra-app"
      data-motion={motionPreference}
      data-panel-transition={panelMotion.treatment}
      style={{
        "--panel-motion-ms": panelMotion.duration,
        "--panel-motion-easing": panelMotion.easing,
      } as CSSProperties}
    >
      <header className="petra-topbar">
        <div>
          <p className="petra-kicker">Living laboratory</p>
          <h1>Petra</h1>
        </div>

        <div className="petra-topbar__actions">
          <label className="motion-control">
            <span>Motion</span>
            <select
              aria-label="Motion preference"
              value={motionSetting}
              onChange={(event) => {
                const setting = parseMotionSetting(event.target.value);
                setMotionSetting(setting);
                try {
                  saveMotionSetting(globalThis.localStorage, setting);
                } catch {
                  // Keep the explicit in-memory preference when storage is unavailable.
                }
              }}
            >
              <option value="system">System</option>
              <option value="full">Full</option>
              <option value="reduced">Reduced</option>
              <option value="off">Off</option>
            </select>
          </label>
          <button
            type="button"
            className="ghost-button"
            aria-expanded={sourcesOpen}
            aria-controls="petra-sources-panel"
            onClick={() => setSourcesOpen((open) => !open)}
          >
            {sourcesOpen ? "Close sources" : "Sources"}
          </button>
        </div>
      </header>

      {sourcesOpen ? (
        <section id="petra-sources-panel" className="petra-sources-surface">
          <ProvenancePanel
            records={provenance.records}
            assumptions={provenance.assumptions}
            title="Flagship sources & assumptions"
          />
        </section>
      ) : null}

      <section className="petra-workspace" aria-label="Experiment workspace">
        <aside className="petra-panel petra-panel--tools" aria-label="Interventions">
          <p className="petra-kicker">Interventions</p>
          <h2>Shape the environment</h2>
          <div className="tool-stack">
            <button type="button">Inoculate</button>
            <button type="button">Antibiotic</button>
            <button type="button">Nutrient</button>
            <button type="button">Inspect</button>
          </div>
          <p className="panel-note">
            Controls are shell-only in this checkpoint; authoritative commands
            remain owned by the simulation worker.
          </p>
        </aside>

        <section className="dish-stage" aria-label="Petri dish viewport">
          <div className="dish-stage__halo" aria-hidden="true" />
          <DishViewport motion={motionPreference} />
        </section>

        <aside className="petra-panel petra-panel--inspector" aria-label="Inspector">
          <p className="petra-kicker">Inspector</p>
          <h2>Selected region</h2>
          <dl className="metric-list">
            <div>
              <dt>Lineage</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>Population</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>Drug</dt>
              <dd>—</dd>
            </div>
          </dl>
          <p className="panel-note">
            Scientific values appear only when supplied by authoritative state.
          </p>
        </aside>
      </section>

      <footer className="timeline-shell" aria-label="Simulation timeline">
        <div className="timeline-summary">
          <div>
            <p className="petra-kicker">Timeline</p>
            <strong>{experiment.view.simulationTimeLabel}</strong>
          </div>
          <span
            className="runtime-status"
            data-runtime-status={experiment.view.status}
            role={experiment.view.statusRole}
            aria-live="polite"
          >
            {experiment.view.statusText}
          </span>
        </div>

        {experiment.view.timeline.length > 0 ? (
          <ol className="timeline-events" aria-label="Authoritative simulation events">
            {experiment.view.timeline.slice(-4).map((entry) => (
              <li key={entry.id}>
                <span>{entry.label}</span>
                <time>{entry.simulationTimeHours.toFixed(2)} h</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="timeline-empty">No authoritative events yet</p>
        )}

        <div className="timeline-controls">
          <button
            type="button"
            disabled={!experiment.view.canTogglePlayback}
            onClick={() => {
              experiment.dispatch({
                type: experiment.view.playing ? "pause" : "play",
              });
            }}
          >
            {experiment.view.playing ? "Pause" : "Play"}
          </button>
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              aria-pressed={experiment.view.speed === speed}
              disabled={!experiment.view.canChangeSpeed}
              onClick={() => {
                experiment.dispatch({ type: "set-speed", speed });
              }}
            >
              {speed}×
            </button>
          ))}
        </div>
      </footer>
    </main>
  );
}
