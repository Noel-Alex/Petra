import { useId, type ReactElement } from "react";

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
}

/**
 * Static scientific inspector over an already-authoritative region readout.
 *
 * This component never samples renderer state and never invents biological
 * time or physical units. Pending/stale/error ownership is supplied by the
 * framework-neutral region-inspector state machine.
 */
export function RegionInspectorPanel({
  state,
  title = "Selected region",
  className,
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
        <EmptyReadout state={state} />
      ) : (
        <RegionReadout readout={readout} stale={stale} />
      )}

      <p className="region-inspector-panel__truth-note">
        Values come from authoritative simulation grid state. Model units are
        not relabelled as physical cell counts, concentration, mass, or area
        density, and no biological timestamp is shown until runtime authority
        supplies one.
      </p>
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
  return (
    <section
      className="region-inspector-readout"
      aria-label={stale ? "Stale authoritative region readout" : "Authoritative region readout"}
      data-readout-selection-id={readout.selectionId}
      data-readout-stale={stale ? "true" : "false"}
    >
      <div className="region-inspector-readout__ownership">
        <strong>{stale ? "Stale readout" : "Current readout"}</strong>
        <span>
          Selection <code>{readout.selectionId}</code>
        </span>
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
          label="Composed state schema version"
          value={String(readout.stateVersion)}
        />
      </dl>

      <div className="region-inspector-readout__identity">
        <span>Configuration fingerprint</span>
        <code title={readout.configurationFingerprint}>
          {readout.configurationFingerprint}
        </code>
      </div>

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
                  <th scope="col">Biomass</th>
                  <th scope="col">Region share</th>
                </tr>
              </thead>
              <tbody>
                {readout.lineageBiomass.map((lineage) => (
                  <tr
                    key={lineage.lineageId}
                    data-lineage-id={lineage.lineageId}
                  >
                    <th scope="row">{lineage.lineageId}</th>
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
}: {
  readonly state: RegionInspectorPresentationState;
}): ReactElement {
  const message =
    state.status === "pending"
      ? "No prior authoritative readout is being reused while this selection is pending."
      : state.status === "error"
        ? "No authoritative scientific values are available for display."
        : "Select a region after authoritative simulation state is available.";

  return (
    <div
      className="region-inspector-readout region-inspector-readout--empty"
      data-readout-empty="true"
    >
      {message}
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
      return "Stale data";
    case "ready":
      return "Current";
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
      return `Selection ${state.requestedSelectionId} is pending. Values below still belong to earlier selection ${state.readout.selectionId}.`;
    case "ready":
      return `Showing authoritative values for selection ${state.selectionId}.`;
    case "error":
      if (state.staleReadout !== null) {
        const requested =
          state.selectionId === null
            ? "the current selection"
            : `selection ${state.selectionId}`;
        return `${state.message} Query for ${requested} failed. Values below remain stale and belong to earlier selection ${state.staleReadout.selectionId}.`;
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
