import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  resolveMotion,
  resolveMotionPreference,
  type MotionPreference,
} from "../ui/motion/policy";
import { MOTION } from "../ui/motion/tokens";

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

export function App() {
  const systemReduced = useSystemReducedMotion();
  const [motionOverride, setMotionOverride] = useState<
    MotionPreference | undefined
  >();

  const motionPreference = resolveMotionPreference(
    motionOverride === undefined
      ? { prefersReducedMotion: systemReduced }
      : { explicit: motionOverride, prefersReducedMotion: systemReduced },
  );

  const panelMotion = useMemo(
    () =>
      resolveMotion(motionPreference, {
        kind: "navigational",
        durationMs: MOTION.panel.durationMs,
      }),
    [motionPreference],
  );

  return (
    <main
      className="petra-app"
      data-motion={motionPreference}
      style={{ "--panel-motion-ms": `${panelMotion.durationMs}ms` } as CSSProperties}
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
              value={motionOverride ?? "system"}
              onChange={(event) => {
                const value = event.target.value;
                setMotionOverride(
                  value === "system" ? undefined : (value as MotionPreference),
                );
              }}
            >
              <option value="system">System</option>
              <option value="full">Full</option>
              <option value="reduced">Reduced</option>
              <option value="off">Off</option>
            </select>
          </label>
          <button type="button" className="ghost-button">
            Sources
          </button>
        </div>
      </header>

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
          <div
            className="dish-mount"
            role="img"
            aria-label="Petri dish renderer mount point"
          >
            <div className="dish-placeholder" aria-hidden="true">
              <span className="dish-placeholder__colony dish-placeholder__colony--a" />
              <span className="dish-placeholder__colony dish-placeholder__colony--b" />
              <span className="dish-placeholder__colony dish-placeholder__colony--c" />
            </div>
            <div className="dish-caption">
              <strong>Renderer boundary ready</strong>
              <span>Pixi/WebGL scene mounts here without owning biology.</span>
            </div>
          </div>
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
        <div>
          <p className="petra-kicker">Timeline</p>
          <strong>00:00 simulation time</strong>
        </div>
        <div className="timeline-controls">
          <button type="button">Pause</button>
          <button type="button">1×</button>
          <button type="button">4×</button>
          <button type="button">16×</button>
        </div>
      </footer>
    </main>
  );
}
