import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PetraCompactAction } from "../ui/PetraCompactAction";
import {
  loadVisualContrastSetting,
  parseVisualContrastSetting,
  saveVisualContrastSetting,
  type VisualContrastSetting,
} from "../ui/contrastPreference";
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
import { PetraIcon } from "../ui/icons/PetraIcon";
import { ProvenancePanel } from "../ui/provenance/ProvenancePanel";
import { RegionInspectorPanel } from "../ui/RegionInspectorPanel";
import { DishViewport } from "./DishViewport";
import { projectComposedDishSnapshot } from "./composedDishProjection";
import { ExperimentRunControls } from "./ExperimentRunControls";
import { resolveDishFocusMode } from "./dishFocusMode";
import { CausalNarrationMount } from "./CausalNarrationMount";
import type { AuthoritativeCausalEventStream } from "./causalNarration";
import { InterventionPalette } from "./InterventionPalette";
import {
  InspectorSelectionGlyph,
  PetraBrandMark,
  PetraProfileGlyph,
} from "./InterventionIllustration";
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
  createRegionInspectionRequest,
  projectRegionInspector,
  type RegionInspectionRequest,
} from "./regionInspectorProjection";
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
  const [focusSourceSearch, setFocusSourceSearch] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [interventionPlacement, setInterventionPlacement] = useState(
    createInterventionPlacementState,
  );
  const [regionInspectionRequest, setRegionInspectionRequest] =
    useState<RegionInspectionRequest | null>(null);
  const [motionSetting, setMotionSetting] = useState<MotionSetting>(() => {
    try {
      return loadMotionSetting(globalThis.localStorage);
    } catch {
      return "system";
    }
  });
  const [visualContrast, setVisualContrast] =
    useState<VisualContrastSetting>(() => {
      try {
        return loadVisualContrastSetting(globalThis.localStorage);
      } catch {
        return "standard";
      }
    });

  const provenance = useMemo(() => buildFlagshipProvenanceView(), []);
  const runtimeSnapshot = experiment.state?.snapshot ?? null;
  const runBranchIdentity = experiment.state?.runBranchIdentity ?? null;
  const dishSnapshot = useMemo(
    () =>
      runBranchIdentity === null
        ? null
        : projectComposedDishSnapshot(runtimeSnapshot, runBranchIdentity),
    [runBranchIdentity, runtimeSnapshot],
  );
  const regionInspector = useMemo(
    () =>
      projectRegionInspector(
        experiment.state?.snapshot ?? null,
        regionInspectionRequest,
      ),
    [experiment.state?.snapshot, regionInspectionRequest],
  );
  const regionInspectionAvailable =
    experiment.state?.snapshot?.checkpoint.authority === "composed";

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
    setFocusSourceSearch(false);
    setSourcesLifecycle((current) =>
      closeSourcesSurface(current, hideSourcesPlan),
    );
    focusSourcesTrigger();
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const sourcesPanel = document.getElementById("petra-sources-panel");
      const sourcesTrigger = document.getElementById(SOURCES_TRIGGER_ID);
      const searchTrigger = document.querySelector(".search-trigger");
      const clickedWithinSources =
        sourcesPanel?.contains(target) === true ||
        sourcesTrigger?.contains(target) === true ||
        searchTrigger?.contains(target) === true;

      if (sourcesLifecycle.requestedOpen && !clickedWithinSources) {
        if (
          document.activeElement instanceof HTMLElement &&
          sourcesPanel?.contains(document.activeElement)
        ) {
          document.activeElement.blur();
        }
        setFocusSourceSearch(false);
        setSourcesLifecycle((current) =>
          closeSourcesSurface(current, hideSourcesPlan),
        );
      }

      document
        .querySelectorAll<HTMLDetailsElement>(
          "details.display-preferences[open], details.timeline-history[open]",
        )
        .forEach((surface) => {
          if (!surface.contains(target)) surface.open = false;
        });
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [hideSourcesPlan, sourcesLifecycle.requestedOpen]);

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

  useEffect(() => {
    if (
      !focusSourceSearch ||
      !sourcesLifecycle.mounted ||
      !sourcesLifecycle.requestedOpen ||
      sourcesLifecycle.phase === "exiting"
    ) {
      return;
    }

    const searchInput = document.querySelector<HTMLInputElement>(
      '#petra-sources-panel input[type="search"]',
    );
    if (searchInput !== null) {
      searchInput.focus();
      setFocusSourceSearch(false);
    }
  }, [
    focusSourceSearch,
    sourcesLifecycle.mounted,
    sourcesLifecycle.requestedOpen,
    sourcesLifecycle.phase,
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
      data-visual-contrast={visualContrast}
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
        <div className="petra-brand">
          <span className="petra-brand__mark" aria-hidden="true">
            <PetraBrandMark />
          </span>
          <h1>Petra</h1>
        </div>

        <nav className="petra-primary-nav" aria-label="Primary">
          <a className="petra-primary-nav__link" href="#petra-explore">
            Explore
          </a>
          <a
            className="petra-primary-nav__link"
            href="#petra-simulate"
            aria-current="page"
          >
            Simulate
          </a>
          <PetraCompactAction
            motionPreference={motionPreference}
            className="petra-primary-nav__action"
            aria-expanded={
              learningOpen && !synchronizedOnboardingSession.state.completed
            }
            aria-controls="petra-onboarding"
            data-active={
              learningOpen && !synchronizedOnboardingSession.state.completed
                ? "true"
                : "false"
            }
            onClick={() => {
              if (synchronizedOnboardingSession.state.completed) {
                setOnboardingSession((current) =>
                  applyOnboardingUserAction(
                    current,
                    onboardingProjection,
                    { type: "reset" },
                  ),
                );
                setLearningOpen(true);
                return;
              }
              setLearningOpen((current) => !current);
            }}
          >
            Learn
          </PetraCompactAction>
          <PetraCompactAction
            id={SOURCES_TRIGGER_ID}
            motionPreference={motionPreference}
            className="petra-primary-nav__action"
            aria-expanded={sourcesLifecycle.requestedOpen}
            aria-controls="petra-sources-panel"
            data-active={sourcesLifecycle.requestedOpen ? "true" : "false"}
            onClick={() => {
              if (sourcesLifecycle.requestedOpen) {
                closeSources();
              } else {
                setSourcesLifecycle(openSourcesSurface);
              }
            }}
          >
            Library
          </PetraCompactAction>
        </nav>

        <PetraCompactAction
          motionPreference={motionPreference}
          className="search-trigger"
          aria-label="Search scientific sources and assumptions"
          onClick={() => {
            setFocusSourceSearch(true);
            setSourcesLifecycle(openSourcesSurface);
          }}
        >
          <PetraIcon name="inspect" decorative size={18} />
          <span>Search scientific sources…</span>
        </PetraCompactAction>

        <details className="display-preferences">
          <summary
            className="display-preferences__trigger"
            aria-label="Display preferences"
            aria-controls="petra-display-preferences"
            title="Display preferences"
          >
            <PetraProfileGlyph />
          </summary>
          <div
            id="petra-display-preferences"
            className="display-preferences__surface"
          >
            <p className="display-preferences__heading">Display preferences</p>
            <div className="display-preferences__controls">
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
              <label className="motion-control contrast-control">
                <span>Contrast</span>
                <select
                  aria-label="Visual contrast"
                  value={visualContrast}
                  onChange={(event) => {
                    const setting = parseVisualContrastSetting(event.target.value);
                    setVisualContrast(setting);
                    try {
                      saveVisualContrastSetting(globalThis.localStorage, setting);
                    } catch {
                      // Keep the explicit in-memory preference when storage is unavailable.
                    }
                  }}
                >
                  <option value="standard">Standard</option>
                  <option value="high-contrast">High contrast</option>
                </select>
              </label>
            </div>
          </div>
        </details>
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

      <section
        id="petra-explore"
        className="petra-workspace"
        aria-label="Experiment workspace"
      >
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

        <section
          id="petra-learn"
          className="dish-stage"
          aria-label="Petri dish viewport"
        >
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
            snapshot={dishSnapshot}
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
            onRegionPointActivate={
              regionInspectionAvailable &&
              interventionPlacement.phase !== "placing"
                ? (point) => {
                    const request = createRegionInspectionRequest(
                      experiment.state?.snapshot ?? null,
                      point,
                    );
                    if (request !== null) {
                      setRegionInspectionRequest(request);
                    }
                  }
                : undefined
            }
            regionSelectionActive={regionInspectionRequest !== null}
            onClearRegionSelection={() => setRegionInspectionRequest(null)}
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
          {!learningOpen || synchronizedOnboardingSession.state.completed ? null : (
            <div className="dish-onboarding-layer">
              <section
                id="petra-onboarding"
                className="petra-onboarding-window"
                aria-label="Guided experiment"
              >
                <PetraCompactAction
                  motionPreference={motionPreference}
                  className="petra-onboarding-window__close"
                  onClick={() => setLearningOpen(false)}
                >
                  Close guide
                </PetraCompactAction>
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
              </section>
            </div>
          )}
        </section>

        <div
          className="inspector-shell petra-panel--inspector"
          data-no-region-selected={regionInspectionRequest === null}
        >
          <RegionInspectorPanel
            state={regionInspector.state}
            title="Colony Details"
            className="inspector-shell__region"
            emptyStateAdornment={
              regionInspectionRequest === null ? (
                <InspectorSelectionGlyph />
              ) : undefined
            }
          />
          <AnalysisSurface
            records={analysisRecords}
            motion={motionPreference}
            contrastMode={visualContrast}
          />
          <section className="inspector-activity" aria-label="Live activity">
            <div className="inspector-activity__heading">
              <h3>Live activity</h3>
              <span>No samples</span>
            </div>
            <p>Recorded trends appear when authoritative measurements are available.</p>
            <div className="inspector-activity__empty" aria-hidden="true" />
          </section>
        </div>
      </section>

      <footer
        id="petra-simulate"
        className="timeline-shell"
        aria-label="Simulation timeline"
      >
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
