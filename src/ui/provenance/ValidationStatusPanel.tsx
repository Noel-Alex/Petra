import { useId, type ReactElement } from "react";

import {
  buildScenarioValidationPresentation,
  validationEvidenceStatusLabel,
  type ScenarioValidationStatus,
} from "./validationStatus";
import "./validationStatusPanel.css";

export interface ValidationStatusPanelProps {
  readonly status: ScenarioValidationStatus;
  readonly title?: string;
  readonly className?: string;
}

/**
 * Per-scenario validation evidence without a universal validation verdict.
 *
 * Every lane is rendered independently. Empty, blocked, failed, partial and
 * not-run states stay visible instead of being flattened into one badge.
 */
export function ValidationStatusPanel({
  status,
  title = "Validation evidence",
  className,
}: ValidationStatusPanelProps): ReactElement {
  const presentation = buildScenarioValidationPresentation(status);
  const titleId = useId();
  const classes = ["validation-status-panel", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={classes}
      aria-labelledby={titleId}
      data-validation-schema={presentation.schemaVersion}
      data-scenario-id={presentation.scenarioId}
      data-scenario-version={presentation.scenarioVersion}
    >
      <header className="validation-status-panel__header">
        <div>
          <p className="validation-status-panel__kicker">Evidence by layer</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <p className="validation-status-panel__identity">
          <code>{presentation.scenarioId}</code>
          <span>{presentation.scenarioVersion}</span>
        </p>
      </header>

      <p className="validation-status-panel__boundary">
        Petra reports each validation layer separately. Evidence in one layer
        does not validate the whole simulator.
      </p>

      <div className="validation-status-panel__lanes">
        {presentation.lanes.map((lane) => (
          <article
            key={lane.dimension}
            className="validation-status-panel__lane"
            data-validation-dimension={lane.dimension}
          >
            <h3>{lane.label}</h3>
            {lane.records.length === 0 ? (
              <p
                className="validation-status-panel__empty"
                data-validation-empty="true"
              >
                No evidence supplied for this layer.
              </p>
            ) : (
              <ul className="validation-status-panel__records">
                {lane.records.map((record) => (
                  <li
                    key={record.id}
                    data-validation-evidence-id={record.id}
                    data-validation-status={record.status}
                    data-validation-evidence-kind={record.evidenceKind}
                  >
                    <div className="validation-status-panel__record-heading">
                      <strong>{validationEvidenceStatusLabel(record.status)}</strong>
                      <span>{evidenceKindLabel(record.evidenceKind)}</span>
                    </div>
                    <p>{record.summary}</p>
                    {record.locator === undefined ? null : (
                      <p className="validation-status-panel__locator">
                        Evidence: <code>{record.locator}</code>
                      </p>
                    )}
                    {record.blocker === undefined ? null : (
                      <p className="validation-status-panel__blocker">
                        Blocker: {record.blocker}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function evidenceKindLabel(
  kind: ScenarioValidationStatus["records"][number]["evidenceKind"],
): string {
  if (kind === "source-test") return "Source test";
  if (kind === "scientific-comparison") return "Scientific comparison";
  if (kind === "local-experiment") return "Local experiment";
  if (kind === "browser-rehearsal") return "Browser rehearsal";
  if (kind === "manual-review") return "Manual review";
  return "Demonstration evidence";
}
