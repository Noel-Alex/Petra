import { useId, type ReactElement } from "react";

import {
  PROVENANCE_ICON_MAP,
} from "../icons/spec";
import { PetraIcon } from "../icons/PetraIcon";
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
  const complete = records.filter((record) => record.status === "complete").length;
  const incomplete = records.length - complete;

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
        <ul className="provenance-panel__records">
          {records.map((record) => (
            <li key={record.id}>
              <ProvenanceRecord resolution={record} />
            </li>
          ))}
        </ul>
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
        <IncompleteProblems problems={resolution.problems} />
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
