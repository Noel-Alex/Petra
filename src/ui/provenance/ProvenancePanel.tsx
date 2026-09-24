import { useId, useMemo, useState, type ReactElement } from "react";

import {
  PROVENANCE_ICON_MAP,
} from "../icons/spec";
import { PetraIcon } from "../icons/PetraIcon";
import {
  filterProvenanceRecords,
  PROVENANCE_EVIDENCE_FILTERS,
  type ProvenanceEvidenceFilter,
} from "./filter";
import type { ProvenancePresentation } from "./model";
import type {
  ScenarioAssumptionsResolution,
  ScenarioProvenanceResolution,
} from "./scenarioAdapter";
import "./provenancePanel.css";

export interface ProvenancePanelProps {
  readonly records: readonly ScenarioProvenanceResolution[];
  readonly assumptions?: ScenarioAssumptionsResolution;
  readonly title?: string;
  readonly className?: string;
}

export function ProvenancePanel({
  records,
  assumptions,
  title = "Sources & assumptions",
  className,
}: ProvenancePanelProps): ReactElement {
  const headingId = useId();
  const [query, setQuery] = useState("");
  const [evidence, setEvidence] =
    useState<ProvenanceEvidenceFilter>("all");
  const filtered = useMemo(
    () => filterProvenanceRecords(records, { query, evidence }),
    [records, query, evidence],
  );
  const complete = records.filter((record) => record.status === "complete").length;
  const incomplete = records.length - complete;
  const hasActiveFilter = query.trim().length > 0 || evidence !== "all";

  return (
    <aside
      className={["provenance-panel", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <header className="provenance-panel__header">
        <div>
          <p className="provenance-panel__eyebrow">Scientific provenance</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <p className="provenance-panel__summary" aria-live="polite">
          {complete} complete
          {incomplete > 0 ? ` · ${incomplete} need provenance` : ""}
        </p>
      </header>

      {records.length === 0 ? (
        <p className="provenance-panel__empty">
          No provenance records are available for the active selection.
        </p>
      ) : (
        <>
          <div
            className="provenance-panel__filters"
            role="search"
            aria-label="Filter provenance records"
          >
            <label>
              <span>Search provenance</span>
              <input
                type="search"
                value={query}
                placeholder="Label, source, context…"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </label>
            <label>
              <span>Evidence type</span>
              <select
                value={evidence}
                onChange={(event) => {
                  setEvidence(
                    event.target.value as ProvenanceEvidenceFilter,
                  );
                }}
              >
                {PROVENANCE_EVIDENCE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!hasActiveFilter}
              onClick={() => {
                setQuery("");
                setEvidence("all");
              }}
            >
              Clear
            </button>
          </div>

          <div className="provenance-panel__filter-meta">
            <p aria-live="polite" aria-atomic="true">
              {filtered.records.length} of {records.length} records shown
              {filtered.hiddenCompleteCount > 0
                ? ` · ${filtered.hiddenCompleteCount} complete filtered out`
                : ""}
            </p>
            <p className="provenance-panel__filter-note">
              Needs-provenance records always remain visible
              {filtered.pinnedNeedsProvenanceCount > 0
                ? ` · ${filtered.pinnedNeedsProvenanceCount} pinned by safety rule`
                : ""}.
            </p>
          </div>

          {filtered.records.length === 0 ? (
            <p className="provenance-panel__empty">
              No complete provenance records match the current filters.
            </p>
          ) : (
            <ul className="provenance-panel__records">
              {filtered.records.map((record) => (
                <li key={record.id}>
                  <ProvenanceRecord resolution={record} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {assumptions !== undefined ? (
        <ScenarioAssumptions assumptions={assumptions} />
      ) : null}
    </aside>
  );
}

function ProvenanceRecord({
  resolution,
}: {
  readonly resolution: ScenarioProvenanceResolution;
}): ReactElement {
  const presentation = resolution.presentation;

  return (
    <article
      className="provenance-record"
      data-provenance-status={resolution.status}
      aria-label={
        presentation?.ariaLabel ??
        `${resolution.label}. Provenance incomplete.`
      }
    >
      <header className="provenance-record__header">
        <h3>{resolution.label}</h3>
        {resolution.status === "needs-provenance" ? (
          <strong className="provenance-record__incomplete">
            Needs provenance
          </strong>
        ) : null}
      </header>

      {presentation === null ? (
        <>
          <DeclaredSources sources={resolution.sources} />
          <IncompleteProblems problems={resolution.problems} />
        </>
      ) : (
        <>
          <BadgeList presentation={presentation} />
          <DetailList presentation={presentation} />
          <DisclosureList presentation={presentation} />
          <IncompleteProblems problems={resolution.problems} />
        </>
      )}
    </article>
  );
}

function BadgeList({
  presentation,
}: {
  readonly presentation: ProvenancePresentation;
}): ReactElement {
  return (
    <ul className="provenance-badges" aria-label="Evidence classification">
      {presentation.badges.map((badge) => (
        <li
          key={badge.kind}
          className="provenance-badge"
          data-pattern={badge.patternToken}
        >
          <span className="provenance-badge__pattern" aria-hidden="true" />
          <PetraIcon
            name={PROVENANCE_ICON_MAP[badge.iconToken]}
            size={18}
            decorative
            className="provenance-badge__icon"
          />
          <span className="provenance-badge__copy">
            <strong>{badge.label}</strong>
            <span>{badge.meaning}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DetailList({
  presentation,
}: {
  readonly presentation: ProvenancePresentation;
}): ReactElement | null {
  if (presentation.details.length === 0) return null;

  return (
    <dl className="provenance-record__details">
      {presentation.details.map((detail, index) => (
        <div key={`${detail.label}-${index}`}>
          <dt>{detail.label}</dt>
          <dd>{detail.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DisclosureList({
  presentation,
}: {
  readonly presentation: ProvenancePresentation;
}): ReactElement | null {
  if (presentation.disclosures.length === 0) return null;

  return (
    <div className="provenance-record__disclosures">
      <h4>Disclosures</h4>
      <ul>
        {presentation.disclosures.map((disclosure, index) => (
          <li key={`disclosure-${index}`}>{disclosure}</li>
        ))}
      </ul>
    </div>
  );
}

function DeclaredSources({
  sources,
}: {
  readonly sources: ScenarioProvenanceResolution["sources"];
}): ReactElement | null {
  if (sources.length === 0) return null;

  return (
    <div className="provenance-record__declared-sources">
      <h4>Declared sources</h4>
      <ul>
        {sources.map((source) => (
          <li key={source.id}>
            {source.label}
            {source.locator === undefined ? "" : ` · ${source.locator}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IncompleteProblems({
  problems,
}: {
  readonly problems: readonly string[];
}): ReactElement | null {
  if (problems.length === 0) return null;

  return (
    <div className="provenance-record__problems">
      <h4>Missing or invalid provenance</h4>
      <ul>
        {problems.map((problem, index) => (
          <li key={`problem-${index}`}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

function ScenarioAssumptions({
  assumptions,
}: {
  readonly assumptions: ScenarioAssumptionsResolution;
}): ReactElement {
  const headingId = useId();

  return (
    <section className="provenance-assumptions" aria-labelledby={headingId}>
      <h3 id={headingId}>Scenario assumptions</h3>
      {assumptions.assumptions.length === 0 ? (
        <p>No scenario-wide transfer assumptions are declared.</p>
      ) : (
        <ul>
          {assumptions.assumptions.map((assumption, index) => (
            <li key={`assumption-${index}`}>{assumption}</li>
          ))}
        </ul>
      )}
      {assumptions.problems.length > 0 ? (
        <div className="provenance-record__problems">
          <h4>Assumption metadata issues</h4>
          <ul>
            {assumptions.problems.map((problem, index) => (
              <li key={`assumption-problem-${index}`}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
