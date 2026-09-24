import type { ReactElement } from "react";

import { AnalysisPanel } from "../ui/analysis/AnalysisPanel";
import type { MotionPreference } from "../ui/motion/policy";
import {
  projectAuthoritativeAnalysis,
  type AuthoritativeAnalysisRecords,
} from "./analysisView";

import "./analysisSurface.css";

export interface AnalysisSurfaceProps {
  readonly records?: AuthoritativeAnalysisRecords | null;
  readonly motion: MotionPreference;
}

/**
 * Secondary shell surface for authoritative analysis.
 *
 * The disclosure stays collapsed by default so the Petri dish remains Petra's
 * visual world. Opening/closing this native details element is presentation
 * state only and never pauses or mutates the simulation.
 */
export function AnalysisSurface({
  records = null,
  motion,
}: AnalysisSurfaceProps): ReactElement {
  const view = projectAuthoritativeAnalysis(records);

  if (view.status === "unavailable") {
    return (
      <section
        className="analysis-surface analysis-surface--unavailable"
        aria-label="Scientific analysis"
        data-analysis-status="unavailable"
      >
        <div>
          <p className="petra-kicker">Analysis</p>
          <h2>Authoritative analysis unavailable</h2>
        </div>
        <p>{view.message}</p>
      </section>
    );
  }

  return (
    <details
      className="analysis-surface analysis-surface--available"
      data-analysis-status="available"
      data-run-identity={view.identity.runIdentity}
      data-state-identity={view.identity.stateIdentity}
    >
      <summary>
        <span>
          <span className="petra-kicker">Analysis</span>
          <strong>Population trajectory & lineage ancestry</strong>
        </span>
        <span className="analysis-surface__identity">
          authoritative · {view.identity.simulationTimeHours.toFixed(2)} h
        </span>
      </summary>

      <AnalysisPanel
        charts={view.charts}
        lineageTree={view.lineageTree}
        motion={motion}
      />
    </details>
  );
}
