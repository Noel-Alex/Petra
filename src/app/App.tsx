import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { ProvenancePanel } from "../ui/provenance/ProvenancePanel";
import { DishViewport } from "./DishViewport";
import { ExperimentRunControls } from "./ExperimentRunControls";
import { resolveDishFocusMode } from "./dishFocusMode";
import { CausalNarrationMount } from "./CausalNarrationMount";
import type { AuthoritativeCausalEventStream } from "./causalNarration";
import { InterventionPalette } from "./InterventionPalette";
import {
  beginInterventionPlacement,
  cancelInterventionPlacement,
  createInterventionPlacementState,
  moveInterventionPlacement,
} from "../ui/interventionPlacement";
import { AnalysisSurface } from "./AnalysisSurface";
import type { AuthoritativeAnalysisRecords } from "./analysisView";
import { buildFlagshipProvenanceView } from "./flagshipProvenance";
import { surfaceMotionCss } from "./motionAdapter";
import {
  applyOnboardingUserAction,
  createOnboardingRuntimeSession,
  projectOnboardingRuntime,
  reconcileOnboardingRuntimeSession,
  type AuthoritativeOnboardingGateStream,
} from "./onboardingRuntime";
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
  /**
   * Explicit cumulative science-gate evidence for this exact run/branch.
   * Generic protocol advance events are intentionally insufficient.
   */
  readonly onboardingGates?: AuthoritativeOnboardingGateStream | null;
}

const SOURCES_TRIGGER_ID = "petra-sources-trigger";


function focusSourcesTrigger(): void {
  if (typeof document === "undefined") return;
  document.getElementById(SOURCES_TRIGGER_ID)?.focus();
}

export function App({
  runtimeFactory,
  analysisRecords = null,
  causalEvents = null,
  onboardingGates = null,
}: AppProps) {
  const systemReduced = useSystemReducedMotion();
  const experiment = useExperimentRuntime(runtimeFactory);
  const onboardingProjection = useMemo(
    () => projectOnboardingRuntime(experiment.state, onboardingGates),
    [experiment.state, onboardingGates],
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
  const [interventionPlacement, setInterventionPlacement] = useState(
    createInterventionPlacementState,
  );
  const [motionSetting, setMotionSetting] = useState<MotionSetting>(() => {
    try {
      return loadMotionSetting(globalThis.localStorage);
    } catch {
      return "system";
    }
  });

  const provenance = useMemo(() => buildFlagshipProvenanceView(), []);

  useEffect(() => {
    setOnboardingSession((current) =>
      reconcileOnboardingRuntimeSession(current, onboardingProjection),
    );
  }, [onboardingProjection]);

  useEffect(() => {
    if (
      experiment.view.status === "ready" ||
      experiment.view.status === "pending"
    ) {
      return;
    }
    setInterventionPlacement((current) =>
      cancelInterventionPlacement(current),
    );
  }, [experiment.view.status]);

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
  const dishFocusMode = resolveDishFocusMode({
    status: experiment.view.status,
    playing: experiment.view.playing,
  });

  return (
    <main
      className="petra-app"
      data-motion={motionPreference}
      onKeyDown={(event) => {
        if (
          interventionPlacement.phase === "placing" &&
          event.key === "Escape" &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          setInterventionPlacement((current) =>
            cancelInterventionPlacement(current),
          );
          return;
        }

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
            canStep: experiment.view.runControls.canStep,
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
      data-dish-focus={dishFocusMode}
      style={{
        "--panel-motion-ms": panelMotion.duration,
        "--panel-motion-easing": panelMotion.easing,
      } as CSSProperties}
    >
      <CausalNarrationMount
        activeRunIdentity={experiment.state?.controls.identity ?? null}
        stream={causalEvents}
      />

      {experiment.view.status === "error" ? (
        <section
          className="petra-runtime-recovery"
          aria-labelledby="petra-runtime-recovery-title"
        >
          <div>
            <p className="petra-kicker">Simulation paused</p>
            <h2 id="petra-runtime-recovery-title">
              {experiment.view.failure?.title ?? "Runtime recovery required"}
            </h2>
            <p>{experiment.view.statusText}</p>
          </div>
          {runtimeFactory !== undefined &&
          experiment.view.failure?.recoverable !== false ? (
            <PetraCompactAction
              motionPreference={motionPreference}
              onClick={() => {
                experiment.restart();
              }}
            >
              Restart same run identity
            </PetraCompactAction>
          ) : (
            <p className="panel-note">
              Correct or reselect the incompatible experiment configuration
              before starting another authoritative run.
            </p>
          )}
          {runtimeFactory !== undefined &&
          experiment.view.failure?.recoverable !== false ? (
            <p className="panel-note">
              Restart uses the same scenario, parameters, and seed. It starts a
              fresh authoritative runtime; it does not pretend to resume the
              failed checkpoint.
            </p>
          ) : null}
        </section>
      ) : null}

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
          {synchronizedOnboardingSession.state.completed ? (
            <PetraCompactAction
              motionPreference={motionPreference}
              className="ghost-button"
              onClick={() => {
                setOnboardingSession((current) =>
                  applyOnboardingUserAction(
                    current,
                    onboardingProjection,
                    { type: "reset" },
                  ),
                );
              }}
            >
              Replay guide
            </PetraCompactAction>
          ) : null}
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
            motionPreference={motionPreference}
          />
        </section>
      ) : null}

      <section className="petra-workspace" aria-label="Experiment workspace">
        <InterventionPalette
          motion={motionPreference}
          runtimeStatus={experiment.view.status}
          placement={interventionPlacement}
          onBeginPlacement={(tool) => {
            setInterventionPlacement((current) =>
              beginInterventionPlacement(current, tool),
            );
          }}
          onPlacementPointChange={(point) => {
            setInterventionPlacement((current) =>
              moveInterventionPlacement(current, point),
            );
          }}
          onCancelPlacement={() => {
            setInterventionPlacement((current) =>
              cancelInterventionPlacement(current),
            );
          }}
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
            placement={
              interventionPlacement.phase === "placing"
                ? interventionPlacement
                : null
            }
            onPlacementPointChange={(point) => {
              setInterventionPlacement((current) =>
                moveInterventionPlacement(current, point),
              );
            }}
            onEscapeBeforeOverview={() => {
              if (interventionPlacement.phase === "placing") {
                setInterventionPlacement((current) =>
                  cancelInterventionPlacement(current),
                );
                return true;
              }
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

        <ExperimentRunControls
          motion={motionPreference}
          view={experiment.view}
          dispatch={experiment.dispatch}
        />
      </footer>
    </main>
  );
}
