import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PLAYBACK_SPEEDS } from "../ui/experimentControls";
import { PetraCompactAction } from "../ui/PetraCompactAction";
import {
  loadMotionSetting,
  parseMotionSetting,
  resolveMotionSetting,
  saveMotionSetting,
  type MotionSetting,
} from "../ui/motion/preference";
import { resolveDishAmbient } from "../ui/motion/dishAmbient";
import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import { ProvenancePanel } from "../ui/provenance/ProvenancePanel";
import { DishViewport } from "./DishViewport";
import { InterventionPalette } from "./InterventionPalette";
import { AnalysisSurface } from "./AnalysisSurface";
import type { AuthoritativeAnalysisRecords } from "./analysisView";
import { buildFlagshipProvenanceView } from "./flagshipProvenance";
import { surfaceMotionCss } from "./motionAdapter";
import { shouldCloseSourcesOnEscape } from "./sourcesKeyboard";
import {
  closeSourcesSurface,
  completeSourcesExit,
  createSourcesSurfaceLifecycle,
  openSourcesSurface,
  sourcesExitDelayMs,
} from "./sourcesLifecycle";
import "./sourcesDrawer.css";
import { TimelineHistory } from "./TimelineHistory";
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
    if (query === undefined) {
      return;
    }

    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export interface AppProps {
  readonly runtimeFactory?: ExperimentRuntimeFactory;
  /**
   * Explicit authoritative analysis records. The current synthetic worker
   * snapshot is intentionally not adapted into this contract.
   */
  readonly analysisRecords?: AuthoritativeAnalysisRecords | null;
}

const SOURCES_TRIGGER_ID = "petra-sources-trigger";


function focusSourcesTrigger(): void {
  if (typeof document === "undefined") return;
  document.getElementById(SOURCES_TRIGGER_ID)?.focus();
}

export function App({ runtimeFactory, analysisRecords = null }: AppProps) {
  const systemReduced = useSystemReducedMotion();
  const experiment = useExperimentRuntime(runtimeFactory);
  const [sourcesLifecycle, setSourcesLifecycle] = useState(
    createSourcesSurfaceLifecycle,
  );
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

  const dishAmbient = useMemo(
    () => resolveDishAmbient(motionPreference),
    [motionPreference],
  );

  const showSourcesPlan = useMemo(
    () =>
      planSurfaceTransition({
        surface: "panel",
        action: "show",
        preference: motionPreference,
      }),
    [motionPreference],
  );
  const hideSourcesPlan = useMemo(
    () =>
      planSurfaceTransition({
        surface: "panel",
        action: "hide",
        preference: motionPreference,
      }),
    [motionPreference],
  );

  const closeSources = () => {
    setSourcesLifecycle((current) =>
      closeSourcesSurface(current, hideSourcesPlan),
    );
    focusSourcesTrigger();
  };

  useEffect(() => {
    const delayMs = sourcesExitDelayMs(sourcesLifecycle, hideSourcesPlan);
    if (delayMs === null) return;

    const generation = sourcesLifecycle.generation;
    if (delayMs === 0) {
      setSourcesLifecycle((current) =>
        completeSourcesExit(current, generation),
      );
      return;
    }

    const timer = globalThis.setTimeout(() => {
      setSourcesLifecycle((current) =>
        completeSourcesExit(current, generation),
      );
    }, delayMs);

    return () => globalThis.clearTimeout(timer);
  }, [
    sourcesLifecycle.phase,
    sourcesLifecycle.generation,
    hideSourcesPlan.keepMountedDuringExit,
    hideSourcesPlan.durationMs,
  ]);

  const activeSourcesPlan =
    sourcesLifecycle.phase === "exiting" ? hideSourcesPlan : showSourcesPlan;
  const panelMotion = useMemo(
    () => surfaceMotionCss(activeSourcesPlan),
    [activeSourcesPlan],
  );

  return (
    <main
      className="petra-app"
      data-motion={motionPreference}
      onKeyDown={(event) => {
        if (
          !shouldCloseSourcesOnEscape({
            open: sourcesLifecycle.requestedOpen,
            key: event.key,
            defaultPrevented: event.defaultPrevented,
            target: event.target,
          })
        ) {
          return;
        }

        event.preventDefault();
        closeSources();
      }}
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
          <PetraCompactAction
            id={SOURCES_TRIGGER_ID}
            motionPreference={motionPreference}
            className="ghost-button"
            aria-expanded={sourcesLifecycle.requestedOpen}
            aria-controls="petra-sources-panel"
            onClick={() => {
              if (sourcesLifecycle.requestedOpen) {
                closeSources();
              } else {
                setSourcesLifecycle(openSourcesSurface);
              }
            }}
          >
            {sourcesLifecycle.requestedOpen ? "Close sources" : "Sources"}
          </PetraCompactAction>
        </div>
      </header>

      {sourcesLifecycle.mounted ? (
        <section
          id="petra-sources-panel"
          className="sources-drawer"
          aria-label="Flagship scientific sources and assumptions"
          data-transition-treatment={panelMotion.treatment}
          data-surface-phase={sourcesLifecycle.phase}
          aria-hidden={
            sourcesLifecycle.phase === "exiting" ? true : undefined
          }
          inert={sourcesLifecycle.phase === "exiting"}
        >
          <div className="sources-drawer__chrome">
            <p className="sources-drawer__scope" role="note">
              <strong>{provenance.scenario.title}</strong>
              <span>
                Curated flagship evidence set · version{" "}
                <code>{provenance.scenario.version}</code>.
              </span>
              <span>
                This does not claim that the current runtime has selected this
                scenario.
              </span>
            </p>
            <PetraCompactAction
              motionPreference={motionPreference}
              className="ghost-button"
              onClick={closeSources}
            >
              Close
            </PetraCompactAction>
          </div>
          <ProvenancePanel
            records={provenance.records}
            assumptions={provenance.assumptions}
            title="Flagship sources & assumptions"
          />
        </section>
      ) : null}

      <section className="petra-workspace" aria-label="Experiment workspace">
        <InterventionPalette
          motion={motionPreference}
          runtimeStatus={experiment.view.status}
        />

        <section className="dish-stage" aria-label="Petri dish viewport">
          <div
            className="dish-stage__halo"
            aria-hidden="true"
            data-ambient-motion={
              dishAmbient.motion.treatment === "animate" &&
              dishAmbient.motion.loops
                ? "animate"
                : "static"
            }
            style={{
              "--dish-ambient-ms": `${dishAmbient.motion.durationMs}ms`,
              "--dish-ambient-easing": `cubic-bezier(${dishAmbient.easing.join(", ")})`,
            } as CSSProperties}
          />
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

      <AnalysisSurface
        records={analysisRecords}
        motion={motionPreference}
      />

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

        <TimelineHistory entries={experiment.view.timeline} />

        <div className="timeline-controls">
          <PetraCompactAction
            motionPreference={motionPreference}
            disabled={!experiment.view.canTogglePlayback}
            onClick={() => {
              experiment.dispatch({
                type: experiment.view.playing ? "pause" : "play",
              });
            }}
          >
            {experiment.view.playing ? "Pause" : "Play"}
          </PetraCompactAction>
          {PLAYBACK_SPEEDS.map((speed) => (
            <PetraCompactAction
              key={speed}
              motionPreference={motionPreference}
              selected={experiment.view.speed === speed}
              disabled={!experiment.view.canChangeSpeed}
              onClick={() => {
                experiment.dispatch({ type: "set-speed", speed });
              }}
            >
              {speed}×
            </PetraCompactAction>
          ))}
        </div>
      </footer>
    </main>
  );
}
