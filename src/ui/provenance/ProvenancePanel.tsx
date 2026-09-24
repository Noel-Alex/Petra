import {
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import {
  resolveMotion,
  type MotionPreference,
} from "../motion/policy";
import { MOTION } from "../motion/tokens";
import {
  adaptAuthoritativeProvenanceList,
  type AdaptedProvenanceRecord,
  type AuthoritativeProvenanceRecord,
} from "./authoritative";
import type {
  EvidenceBadge,
  ProvenancePresentation,
} from "./model";
import "./ProvenancePanel.css";

export interface ProvenancePanelProps {
  readonly records: readonly AuthoritativeProvenanceRecord[];
  readonly motionPreference: MotionPreference;
  readonly title?: string;
}

/**
 * Judge-facing Sources / Assumptions surface.
 *
 * It presents explicit provenance supplied by authority layers. It never
 * reclassifies science and never treats source count or evidence tier as an
 * evidence class.
 */
export function ProvenancePanel({
  records,
  motionPreference,
  title = "Sources & assumptions",
}: ProvenancePanelProps) {
  const adapted = useMemo(
    () => adaptAuthoritativeProvenanceList(records),
    [records],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => adapted[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");

  const panelMotion = useMemo(
    () =>
      resolveMotion(motionPreference, {
        kind: "navigational",
        durationMs: MOTION.panel.durationMs,
      }),
    [motionPreference],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      normalizedQuery.length === 0
        ? adapted
        : adapted.filter((record) =>
            searchableText(record).includes(normalizedQuery),
          ),
    [adapted, normalizedQuery],
  );

  const selected =
    visible.find((record) => record.id === selectedId) ??
    visible[0] ??
    null;

  const style = {
    "--provenance-motion-ms": `${panelMotion.durationMs}ms`,
    "--provenance-easing": `cubic-bezier(${MOTION.panel.easing.join(", ")})`,
  } as CSSProperties;

  return (
    <section
      className="petra-provenance"
      data-motion-treatment={panelMotion.treatment}
      style={style}
      aria-label={title}
    >
      <header className="petra-provenance__header">
        <div>
          <p className="petra-provenance__eyebrow">Scientific audit trail</p>
          <h2>{title}</h2>
          <p>
            See what is measured, transferred, modeled, calibrated, or still
            incomplete without hiding the seams between studies.
          </p>
        </div>
        <div className="petra-provenance__summary" aria-label="Provenance summary">
          <strong>{adapted.length}</strong>
          <span>active records</span>
          <strong>{countIncomplete(adapted)}</strong>
          <span>need attention</span>
        </div>
      </header>

      <label className="petra-provenance__search">
        <span>Find a parameter or mechanism</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="e.g. ciprofloxacin, MIC, diffusion"
        />
      </label>

      <div className="petra-provenance__workspace">
        <nav className="petra-provenance__list" aria-label="Provenance records">
          {visible.length === 0 ? (
            <p className="petra-provenance__empty">No matching provenance records.</p>
          ) : (
            visible.map((record) => (
              <RecordButton
                key={record.id}
                record={record}
                selected={record.id === selected?.id}
                onSelect={() => setSelectedId(record.id)}
              />
            ))
          )}
        </nav>

        <div className="petra-provenance__detail" aria-live="polite">
          {selected === null ? (
            <div className="petra-provenance__empty">
              Select an active record to inspect its scientific basis.
            </div>
          ) : selected.kind === "presentation" ? (
            <PresentationDetail presentation={selected.presentation} />
          ) : (
            <UnclassifiedDetail record={selected} />
          )}
        </div>
      </div>
    </section>
  );
}

interface RecordButtonProps {
  readonly record: AdaptedProvenanceRecord;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function RecordButton({
  record,
  selected,
  onSelect,
}: RecordButtonProps) {
  const status =
    record.kind === "needs-classification"
      ? "needs-provenance"
      : record.presentation.status;

  return (
    <button
      type="button"
      className="petra-provenance__record"
      data-status={status}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="petra-provenance__record-mark" aria-hidden="true" />
      <span>
        <strong>{record.label}</strong>
        <small>
          {record.kind === "presentation"
            ? record.presentation.badges.map((badge) => badge.label).join(" + ")
            : "Evidence class missing"}
        </small>
      </span>
      <span className="petra-provenance__record-status">
        {status === "complete" ? "Ready" : "Check"}
      </span>
    </button>
  );
}

function PresentationDetail({
  presentation,
}: {
  readonly presentation: ProvenancePresentation;
}) {
  return (
    <article
      className="petra-provenance__card"
      data-status={presentation.status}
      aria-label={presentation.ariaLabel}
    >
      <header className="petra-provenance__card-header">
        <div>
          <p className="petra-provenance__eyebrow">
            {presentation.status === "complete"
              ? "Traceable evidence"
              : "Incomplete provenance"}
          </p>
          <h3>{presentation.label}</h3>
        </div>
        <span className="petra-provenance__status-chip">
          {presentation.status === "complete" ? "Traceable" : "Needs provenance"}
        </span>
      </header>

      <div className="petra-provenance__badges" aria-label="Evidence classification">
        {presentation.badges.map((badge) => (
          <EvidenceBadgeView key={badge.kind} badge={badge} />
        ))}
      </div>

      {presentation.details.length > 0 ? (
        <dl className="petra-provenance__details">
          {presentation.details.map((row, index) => (
            <div key={`${row.label}-${index}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="petra-provenance__disclosures" aria-label="Assumptions and limitations">
        <h4>Assumptions & limitations</h4>
        {presentation.disclosures.length === 0 ? (
          <p>No additional disclosure is recorded for this item.</p>
        ) : (
          <ul>
            {presentation.disclosures.map((disclosure, index) => (
              <li key={`${index}-${disclosure}`}>{disclosure}</li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function EvidenceBadgeView({ badge }: { readonly badge: EvidenceBadge }) {
  return (
    <div
      className="petra-provenance__badge"
      data-kind={badge.kind}
      data-pattern={badge.patternToken}
      title={badge.meaning}
    >
      <span
        className="petra-provenance__badge-icon"
        data-icon-token={badge.iconToken}
        aria-hidden="true"
      />
      <span>
        <strong>{badge.label}</strong>
        <small>{badge.meaning}</small>
      </span>
    </div>
  );
}

function UnclassifiedDetail({
  record,
}: {
  readonly record: Extract<
    AdaptedProvenanceRecord,
    { readonly kind: "needs-classification" }
  >;
}) {
  return (
    <article
      className="petra-provenance__card"
      data-status="needs-provenance"
      aria-label={`${record.label}. Evidence class incomplete.`}
    >
      <header className="petra-provenance__card-header">
        <div>
          <p className="petra-provenance__eyebrow">Authority data incomplete</p>
          <h3>{record.label}</h3>
        </div>
        <span className="petra-provenance__status-chip">Needs provenance</span>
      </header>

      <div className="petra-provenance__warning">
        <span aria-hidden="true">!</span>
        <div>
          <strong>No scientific class was inferred.</strong>
          <p>{record.message}</p>
          {record.evidenceTier !== null ? (
            <p>
              Legacy evidence tier <code>{record.evidenceTier}</code> is shown
              only as metadata and does not determine the scientific class.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function searchableText(record: AdaptedProvenanceRecord): string {
  if (record.kind === "needs-classification") {
    return `${record.label} ${record.rawEvidenceClass ?? ""} ${record.evidenceTier ?? ""}`.toLowerCase();
  }

  return [
    record.label,
    ...record.presentation.badges.map((badge) => badge.label),
    ...record.presentation.details.flatMap((detail) => [
      detail.label,
      detail.value,
    ]),
    ...record.presentation.disclosures,
  ]
    .join(" ")
    .toLowerCase();
}

function countIncomplete(records: readonly AdaptedProvenanceRecord[]): number {
  return records.filter(
    (record) =>
      record.kind === "needs-classification" ||
      record.presentation.status === "needs-provenance",
  ).length;
}
