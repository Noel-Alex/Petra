import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PLAYBACK_SPEEDS } from "../ui/experimentControls";
import { playbackSpeedShortcut } from "../ui/keyboard";
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
import { OnboardingGuide } from "../ui/onboarding/OnboardingGuide";
import { PresenterGuide } from "../ui/demo/PresenterGuide";
import { ProvenancePanel } from "../ui/provenance/ProvenancePanel";
import { DishViewport } from "./DishViewport";
import { CausalNarrationMount } from "./CausalNarrationMount";
import type { AuthoritativeCausalEventStream } from "./causalNarration";
import { InterventionPalette } from "./InterventionPalette";
import { AnalysisSurface } from "./AnalysisSurface";
import type { AuthoritativeAnalysisRecords } from "./analysisView";
import { buildFlagshipProvenanceView } from "./flagshipProvenance";
import { surfaceMotionCss } from "./motionAdapter";
import {
  applyOnboardingUserAction,
  createOnboardingRuntimeSession,
  projectOnboardingRuntime,
  reconcileOnboardingRuntimeSession,
} from "./onboardingRuntime";
import {
  applyPresenterUserEvent,
  createPresenterRuntimeSession,
  projectPresenterRuntime,
  reconcilePresenterRuntimeSession,
} from "./presenterRuntime";
import {
  canDispatchAppShortcut,
  planAppKeyboardShortcut,
} from "./appKeyboard";
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
  /**
   * Already-authoritative causal-event vocabulary. The current synthetic
   * protocol is intentionally ineligible and therefore supplies no stream.
   */
  readonly causalEvents?: AuthoritativeCausalEventStream | null;
}

const SOURCES_TRIGGER_ID = "petra-sources-trigger";
const PRESENTER_TRIGGER_ID = "petra-presenter-trigger";
const PRESENTER_PANEL_ID = "petra-presenter-mode";


function focusSourcesTrigger(): void {
  if (typeof document === "undefined") return;
  document.getElementById(SOURCES_TRIGGER_ID)?.focus();
}

function focusPresenterTrigger(): void {
  if (typeof document === "undefined") return;
  document.getElementById(PRESENTER_TRIGGER_ID)?.focus();
}

export function App({
  runtimeFactory,
  analysisRecords = null,
  causalEvents = null,
}: AppProps) {
  const systemReduced = useSystemReducedMotion();
  const experiment = useExperimentRuntime(runtimeFactory);
  const onboardingProjection = useMemo(
    () => projectOnboardingRuntime(experiment.state),
    [experiment.state],
  );
  const [onboardingSession, setOnboardingSession] = useState(() =>
    createOnboardingRuntimeSession(onboardingProjection),
  );
  const synchronizedOnboardingSession = useMemo(
    () =>
      reconcileOnboardingRuntimeSession(
        onboardingSession,
        onboardingProjection,
      ),
    [onboardingProjection, onboardingSession],
  );
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

  const presenterProjection = useMemo(
    () => projectPresenterRuntime(experiment.state, provenance.scenario),
    [experiment.state, provenance.scenario],
  );
  const [presenterSession, setPresenterSession] = useState(() =>
    createPresenterRuntimeSession(presenterProjection),
  );
  const synchronizedPresenterSession = useMemo(
    () =>
      reconcilePresenterRuntimeSession(
        presenterSession,
        presenterProjection,
      ),
    [presenterProjection, presenterSession],
  );
  const [presenterOpen, setPresenterOpen] = useState(false);

  useEffect(() => {
    setOnboardingSession((current) =>
      reconcileOnboardingRuntimeSession(current, onboardingProjection),
    );
  }, [onboardingProjection]);

  useEffect(() => {
    setPresenterSession((current) =>
      reconcilePresenterRuntimeSession(current, presenterProjection),
    );
    if (presenterProjection.runIdentityKey === null) {
      setPresenterOpen(false);
    }
  }, [presenterProjection]);

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

  const closePresenter = () => {
    setPresenterOpen(false);
    focusPresenterTrigger();
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
        const plan = planAppKeyboardShortcut({
          sourcesOpen: sourcesLifecycle.requestedOpen,
          key: event.key,
          defaultPrevented: event.defaultPrevented,
          target: event.target,
        });

        if (plan.type === "none") return;

        if (plan.type === "close-sources") {
          event.preventDefault();
          closeSources();
          return;
        }

        if (
          !canDispatchAppShortcut(plan.action, {
            playing: experiment.view.playing,
            canTogglePlayback: experiment.view.canTogglePlayback,
            canChangeSpeed: experiment.view.canChangeSpeed,
            canStep: experiment.view.status === "ready",
          })
        ) {
          return;
        }

        const result = experiment.dispatch(plan.action);
        if (result?.accepted === true) {
          event.preventDefault();
        }
      }}
      data-panel-transition={panelMotion.treatment}
      style={{
        "--panel-motion-ms": panelMotion.duration,
        "--panel-motion-easing": panelMotion.easing,
      } as CSSProperties}
    >
      <CausalNarrationMount
        activeRunIdentity={experiment.state?.controls.identity ?? null}
        stream={causalEvents}
      />

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
          {presenterProjection.runIdentityKey === null ? null : (
            <PetraCompactAction
              id={PRESENTER_TRIGGER_ID}
              motionPreference={motionPreference}
              className="ghost-button"
              aria-expanded={presenterOpen}
              aria-controls={PRESENTER_PANEL_ID}
              onClick={() => setPresenterOpen((open) => !open)}
            >
              {presenterOpen ? "Hide presenter" : "Presenter mode"}
            </PetraCompactAction>
          )}
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
            motionPreference={motionPreference}
          />
        </section>
      ) : null}

      {presenterOpen &&
      synchronizedPresenterSession.state.runIdentity !== null ? (
        <section
          id={PRESENTER_PANEL_ID}
          className="presenter-shell"
          aria-label="Expo presenter mode"
        >
          <div className="presenter-shell__chrome">
            <div className="presenter-shell__context">
              <p className="petra-kicker">Presenter</p>
              <strong>Bound to the current authoritative run.</strong>
              <span>
                Only verified evidence gates advance the story. Unsupported
                science remains visibly blocked.
              </span>
            </div>
            <PetraCompactAction
              motionPreference={motionPreference}
              className="ghost-button"
              onClick={closePresenter}
            >
              Close presenter
            </PetraCompactAction>
          </div>
          <PresenterGuide
            state={synchronizedPresenterSession.state}
            motionPreference={motionPreference}
            onEvent={(event) => {
              setPresenterSession((current) =>
                applyPresenterUserEvent(
                  current,
                  presenterProjection,
                  event,
                ),
              );
            }}
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
          <DishViewport
            motion={motionPreference}
            onEscapeBeforeOverview={() => {
              if (!sourcesLifecycle.requestedOpen) return false;
              closeSources();
              return true;
            }}
          />
          {synchronizedOnboardingSession.state.completed ? null : (
            <div className="dish-onboarding-layer">
              <OnboardingGuide
                state={synchronizedOnboardingSession.state}
                motionPreference={motionPreference}
                onAction={(action) => {
                  setOnboardingSession((current) =>
                    applyOnboardingUserAction(
                      current,
                      onboardingProjection,
                      action,
                    ),
                  );
                }}
              />
            </div>
          )}
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
            aria-keyshortcuts="Space"
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
              aria-keyshortcuts={playbackSpeedShortcut(speed)}
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
