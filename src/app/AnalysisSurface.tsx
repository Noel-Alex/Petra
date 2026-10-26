import type { ReactElement, SyntheticEvent } from "react";

import { AnalysisPanel } from "../ui/analysis/AnalysisPanel";
import type { LineageContrastMode } from "../design/lineageIdentity";
import type { MotionPreference } from "../ui/motion/policy";
import {
  projectAuthoritativeAnalysis,
  type AuthoritativeAnalysisRecords,
} from "./analysisView";

import "./analysisSurface.css";

export interface AnalysisSurfaceProps {
  readonly records?: AuthoritativeAnalysisRecords | null;
  readonly motion: MotionPreference;
  readonly contrastMode?: LineageContrastMode;
  readonly connected?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly selectedLineageId?: string | null;
  readonly onLineageSelect?: (lineageId: string) => void;
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
  contrastMode = "standard",
  connected = false,
  open,
  onOpenChange,
  selectedLineageId = null,
  onLineageSelect,
}: AnalysisSurfaceProps): ReactElement {
  const view = projectAuthoritativeAnalysis(records, { contrastMode });
  const disclosureProps =
    open === undefined
      ? {}
      : {
          open,
          onToggle: (event: SyntheticEvent<HTMLDetailsElement>) =>
            onOpenChange?.(event.currentTarget.open),
        };

  if (view.status === "unavailable") {
    return (
      <details
        {...disclosureProps}
        className="analysis-surface analysis-surface--unavailable"
        data-analysis-status={connected ? "connected" : "unavailable"}
      >
        <summary>
          <span>
            <span className="petra-kicker">Analysis</span>
            <strong>
              {connected
                ? "Authoritative analysis connected"
                : "Authoritative analysis unavailable"}
            </strong>
          </span>
          <span className="analysis-surface__identity">
            {connected ? "open to inspect" : "not connected"}
          </span>
        </summary>
        {open === false ? null : (
          <p className="analysis-surface__unavailable-note">
            {connected
              ? "The live source is connected. Analysis appears after the first eligible authoritative metric sample."
              : view.message}
          </p>
        )}
      </details>
    );
  }

  return (
    <details
      {...disclosureProps}
      className="analysis-surface analysis-surface--available"
      data-analysis-status="available"
      data-run-identity={view.identity.runIdentity}
      data-state-identity={view.identity.stateIdentity}
      data-contrast-mode={contrastMode}
    >
      <summary>
        <span>
          <span className="petra-kicker">Analysis</span>
          <strong>Scientific trajectories & lineage ancestry</strong>
        </span>
        <span className="analysis-surface__identity">
          authoritative · {view.identity.simulationTimeHours.toFixed(2)} h
        </span>
      </summary>

      {open === false ? null : (
        <AnalysisPanel
          charts={view.charts}
          lineageTree={view.lineageTree}
          motion={motion}
          selectedLineageId={selectedLineageId}
          onLineageSelect={onLineageSelect}
        />
      )}
    </details>
  );
}
