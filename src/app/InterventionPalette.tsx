import { useId } from "react";

import { PetraCompactAction } from "../ui/PetraCompactAction";
import type { MotionPreference } from "../ui/motion/policy";
import { projectInterventionCapability } from "./interventionCapability";
import type { RuntimeUiStatus } from "./runtimeView";

export interface InterventionPaletteProps {
  readonly motion: MotionPreference;
  readonly runtimeStatus: RuntimeUiStatus;
}

export function InterventionPalette({
  motion,
  runtimeStatus,
}: InterventionPaletteProps) {
  const reasonId = useId();
  const view = projectInterventionCapability(runtimeStatus);

  return (
    <aside
      className="petra-panel petra-panel--tools"
      aria-label="Interventions"
      data-intervention-capability={view.reason}
    >
      <p className="petra-kicker">Interventions</p>
      <h2>Shape the environment</h2>

      <div className="tool-stack" aria-describedby={reasonId}>
        {view.tools.map(({ tool, label }) => (
          <PetraCompactAction
            key={tool}
            motionPreference={motion}
            disabled
            aria-describedby={reasonId}
            data-intervention-tool={tool}
          >
            {label}
          </PetraCompactAction>
        ))}
      </div>

      <p
        id={reasonId}
        className="panel-note"
        role={view.reason === "runtime-error" ? "alert" : "status"}
      >
        {view.message}
      </p>
    </aside>
  );
}
