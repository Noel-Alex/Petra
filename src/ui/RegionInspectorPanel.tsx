import { resolveLineageVisualIdentity } from "../design/lineageIdentity";
import { useId, type ReactElement, type ReactNode } from "react";

import type { AuthoritativeRegionInspection } from "../sim/regionInspector";
import {
  activeSelectionId,
  visibleReadout,
  type RegionInspectorPresentationState,
} from "./regionInspectorState";

import "./regionInspectorPanel.css";

export interface RegionInspectorPanelProps {
  readonly state: RegionInspectorPresentationState;
  readonly title?: string;
  readonly className?: string;
  readonly emptyStateAdornment?: ReactNode;
}

/**
 * Static scientific inspector over an already-authoritative region readout.
 *
 * This component never samples renderer state and never invents biological
 * time or physical units. Biological time is displayed only when supplied by
 * the authoritative checkpoint-bound readout. Pending/stale/error ownership is
 * supplied by the framework-neutral region-inspector state machine.
 */
export function RegionInspectorPanel({
  state,
  title = "Selected region",
  className,
  emptyStateAdornment,
}: RegionInspectorPanelProps): ReactElement {
  const titleId = useId();
  const statusId = useId();
  const readout = visibleReadout(state);
  const requestedSelectionId = activeSelectionId(state);
  const stale = readout !== null && state.status !== "ready";

  return (
    <aside
      className={["region-inspector-panel", className]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
      aria-describedby={statusId}
      data-region-inspector-status={state.status}
      data-active-selection-id={requestedSelectionId ?? undefined}
    >
      <header className="region-inspector-panel__header">
        <div>
          <p className="region-inspector-panel__kicker">
            Authoritative local state
          </p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <span
          className="region-inspector-panel__status-badge"
          data-status={state.status}
        >
          {statusLabel(state)}
        </span>
      </header>

      <p
        id={statusId}
        className="region-inspector-panel__status-copy"
        role={state.status === "error" ? "alert" : "status"}
      >
        {statusCopy(state)}
      </p>

      {readout === null ? (
        <EmptyReadout state={state} adornment={emptyStateAdornment} />
      ) : (
        <RegionReadout readout={readout} stale={stale} />
      )}

      <details className="region-inspector-panel__truth-disclosure">
        <summary>Measurement notes</summary>
        <p className="region-inspector-panel__truth-note">
          Any displayed scientific values come from authoritative simulation
          grid state. Model units are not relabelled as physical cell counts,
          concentration, mass, or area density. Biological time, tick, and
          command position are the exact checkpoint values supplied by
          simulation authority, never inferred from animation or renderer
          state.
        </p>
      </details>
    </aside>
  );
}

function RegionReadout({
  readout,
  stale,
}: {
  readonly readout: AuthoritativeRegionInspection;
  readonly stale: boolean;
}): ReactElement {
  if (readout.kind === "no-grid-coverage") {
    return (
      <section
        className="region-inspector-readout"
        aria-label={
          stale
            ? "Stale authoritative no-grid-coverage result"
            : "Authoritative no-grid-coverage result"
        }
        data-readout-selection-id={readout.selectionId}
        data-readout-stale={stale ? "true" : "false"}
        data-readout-kind="no-grid-coverage"
      >
        <div className="region-inspector-readout__ownership">
          <strong>{stale ? "Stale result" : "Current result"}</strong>
        </div>

        <div
          className="region-inspector-readout region-inspector-readout--empty"
          data-readout-empty="true"
        >
          This selection covers no authoritative simulation grid cell centres
          inside the dish mask. No biomass or resource measurement is reported.
        </div>

        <dl className="region-inspector-readout__metrics">
          <Metric
            label="Grid coverage"
            value="No authoritative grid cells"
          />
          <Metric
            label="Simulation time"
            value={`${formatNumber(readout.simulationTimeHours)} h`}
          />
          <Metric label="Authoritative tick" value={String(readout.tick)} />
        </dl>

        <RunProvenance readout={readout} />
      </section>
    );
  }

  return (
    <section
      className="region-inspector-readout"
      aria-label={
        stale
          ? "Stale authoritative region readout"
          : "Authoritative region readout"
      }
      data-readout-selection-id={readout.selectionId}
      data-readout-stale={stale ? "true" : "false"}
      data-readout-kind="measured"
    >
      <div className="region-inspector-readout__ownership">
        <strong>{stale ? "Stale readout" : "Current readout"}</strong>
      </div>

      <dl className="region-inspector-readout__metrics">
        <Metric
          label="Selected simulation grid cells"
          value={String(readout.selectedCellCount)}
        />
        <Metric
          label="Total biomass"
          value={`${formatNumber(readout.totalBiomass)} ${readout.biomassUnit}`}
        />
        <Metric
          label="Total resource"
          value={`${formatNumber(readout.totalResource)} ${readout.resourceUnit}`}
        />
        <Metric
          label="Simulation time"
          value={`${formatNumber(readout.simulationTimeHours)} h`}
        />
        <Metric label="Authoritative tick" value={String(readout.tick)} />
      </dl>

      <RunProvenance readout={readout} />

      <div className="region-inspector-lineages">
        <h3>Lineage composition</h3>
        {readout.lineageBiomass.length === 0 ? (
          <p className="region-inspector-lineages__empty">
            No authoritative lineage biomass channels are present in this
            readout.
          </p>
        ) : (
          <div
            className="region-inspector-lineages__scroll"
            role="region"
            aria-label="Authoritative region lineage composition"
            tabIndex={0}
          >
            <table>
              <caption>Authoritative lineage biomass in the selected region</caption>
              <thead>
                <tr>
                  <th scope="col">Lineage</th>
                  <th scope="col">Genotype</th>
                  <th scope="col">Biomass</th>
                  <th scope="col">Region share</th>
                </tr>
              </thead>
              <tbody>
                {readout.lineageBiomass.map((lineage) => (
                  <tr
                    key={lineage.lineageId}
                    data-lineage-id={lineage.lineageId}
                    data-genotype-id={lineage.genotypeId}
                  >
                    <th scope="row"><span className="lineage-color-key" aria-hidden="true" style={{ backgroundColor: `var(--petra-color-${resolveLineageVisualIdentity(lineage.lineageId).colorToken})` }} />{lineage.lineageId}</th>
                    <td>
                      <code>{lineage.genotypeId}</code>
                    </td>
                    <td>
                      {formatNumber(lineage.biomass)} {readout.biomassUnit}
                    </td>
                    <td>{formatPercent(lineage.fractionOfRegionBiomass)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function RunProvenance({
  readout,
}: {
  readonly readout: AuthoritativeRegionInspection;
}): ReactElement {
  const identity = readout.runIdentity;
  return (
    <details className="region-inspector-readout__provenance">
      <summary>Run provenance</summary>
      <div className="region-inspector-readout__provenance-content">
        <dl className="region-inspector-readout__metrics">
          <Metric label="Selection" value={readout.selectionId} />
          <Metric
            label="Accepted command position"
            value={String(readout.commandCount)}
          />
          <Metric
            label="Scenario"
            value={`${identity.scenarioId}@${identity.scenarioVersion}`}
          />
          <Metric
            label="Parameter set"
            value={`${identity.parameterSetId}@${identity.parameterSetVersion}`}
          />
          <Metric label="Run seed" value={String(identity.seed)} />
          <Metric
            label="Composed state schema version"
            value={String(readout.stateVersion)}
          />
          <Metric
            label="Engine / protocol"
            value={`${identity.engineVersion} / protocol ${identity.protocolVersion}`}
          />
        </dl>
        <div className="region-inspector-readout__identity">
          <span>Configuration fingerprint</span>
          <code title={readout.configurationFingerprint}>
            {readout.configurationFingerprint}
          </code>
        </div>
      </div>
    </details>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmptyReadout({
  state,
  adornment,
}: {
  readonly state: RegionInspectorPresentationState;
  readonly adornment?: ReactNode;
}): ReactElement {
  const message =
    state.status === "pending"
      ? "No prior authoritative readout is being reused while this selection is pending."
      : state.status === "error"
        ? "No authoritative scientific values are available for display."
        : "No authoritative readout is available for this selection.";

  return (
    <div
      className="region-inspector-readout region-inspector-readout--empty"
      data-readout-empty="true"
    >
      {adornment === undefined ? null : (
        <span className="region-inspector-readout__empty-icon" aria-hidden="true">
          {adornment}
        </span>
      )}
      {state.status === "unavailable" && adornment !== undefined ? (
        <span className="region-inspector-readout__empty-copy">
          <strong>No region selected</strong>
          <span>{state.reason}</span>
        </span>
      ) : (
        <span>{message}</span>
      )}
    </div>
  );
}

function statusLabel(state: RegionInspectorPresentationState): string {
  switch (state.status) {
    case "unavailable":
      return "Unavailable";
    case "pending":
      return "Pending";
    case "stale":
      return "Stale result";
    case "ready":
      return state.readout.kind === "no-grid-coverage"
        ? "No grid coverage"
        : "Current";
    case "error":
      return "Query error";
  }
}

function statusCopy(state: RegionInspectorPresentationState): string {
  switch (state.status) {
    case "unavailable":
      return state.reason;
    case "pending":
      return `Waiting for an authoritative readout for selection ${state.selectionId}.`;
    case "stale":
      return `Selection ${state.requestedSelectionId} is pending. The result below still belongs to earlier selection ${state.readout.selectionId}.`;
    case "ready":
      return state.readout.kind === "no-grid-coverage"
        ? "This selection covers no authoritative grid cells. No biomass or resource measurement is reported."
        : "Showing authoritative values for the selected region.";
    case "error":
      if (state.staleReadout !== null) {
        const requested =
          state.selectionId === null
            ? "the current selection"
            : `selection ${state.selectionId}`;
        return `${state.message} Query for ${requested} failed. The result below remains stale and belongs to earlier selection ${state.staleReadout.selectionId}.`;
      }
      return `${state.message} No authoritative scientific readout is shown.`;
  }
}

function formatNumber(value: number): string {
  const magnitude = Math.abs(value);
  if ((magnitude !== 0 && magnitude < 0.001) || magnitude >= 10_000) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}

function formatPercent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(1))}%`;
}
