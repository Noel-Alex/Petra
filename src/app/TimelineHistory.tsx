import type { ReactElement } from "react";

import type { TimelineEntry } from "../ui/timeline";
import "./timelineHistory.css";

export interface TimelineHistoryProps {
  readonly entries: readonly TimelineEntry[];
  readonly recentLimit?: number;
}

export interface TimelineHistoryPlan {
  readonly recent: readonly TimelineEntry[];
  readonly all: readonly TimelineEntry[];
  readonly olderCount: number;
}

export interface TimelineHistoryKeyEvent {
  readonly key: string;
  stopPropagation(): void;
}

/**
 * Keeps Space inside the focusable history scroller so the browser can perform
 * its native scroll default without the App-level playback shortcut seeing it.
 * Deliberately does not call preventDefault().
 */
export function keepTimelineHistorySpaceLocal(
  event: TimelineHistoryKeyEvent,
): void {
  if (event.key === " " || event.key === "Spacebar") {
    event.stopPropagation();
  }
}

export function planTimelineHistory(
  entries: readonly TimelineEntry[],
  recentLimit = 4,
): TimelineHistoryPlan {
  if (!Number.isInteger(recentLimit) || recentLimit < 1) {
    throw new RangeError("recentLimit must be a positive integer");
  }

  const olderCount = Math.max(0, entries.length - recentLimit);

  return {
    recent: entries.slice(olderCount),
    all: entries,
    olderCount,
  };
}

/**
 * Compact recent-event summary plus a native, user-controlled complete history.
 *
 * The component never reorders, summarizes, drops, focuses, or scrolls the
 * authoritative timeline. Opening/closing history is presentation state only.
 */
export function TimelineHistory({
  entries,
  recentLimit = 4,
}: TimelineHistoryProps): ReactElement {
  if (entries.length === 0) {
    return <p className="timeline-empty">No authoritative events yet</p>;
  }

  const plan = planTimelineHistory(entries, recentLimit);

  return (
    <div className="timeline-history-shell">
      <ol
        className="timeline-events"
        aria-label="Recent authoritative simulation events"
      >
        {plan.recent.map((entry) => (
          <TimelineEventRow key={entry.id} entry={entry} compact />
        ))}
      </ol>

      {plan.olderCount > 0 ? (
        <details className="timeline-history">
          <summary>
            <span>Full history</span>
            <span className="timeline-history__count">
              {entries.length} events · {plan.olderCount} older
            </span>
          </summary>

          <div
            className="timeline-history__scroll"
            role="region"
            aria-label="Complete authoritative simulation event history"
            tabIndex={0}
            onKeyDown={keepTimelineHistorySpaceLocal}
          >
            <ol className="timeline-history__events">
              {plan.all.map((entry) => (
                <TimelineEventRow key={entry.id} entry={entry} />
              ))}
            </ol>
          </div>
        </details>
      ) : (
        <p className="timeline-history__count">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </p>
      )}
    </div>
  );
}

function TimelineEventRow({
  entry,
  compact = false,
}: {
  readonly entry: TimelineEntry;
  readonly compact?: boolean;
}): ReactElement {
  return (
    <li
      className={compact ? undefined : "timeline-history__event"}
      data-event-sequence={entry.sequence}
      data-event-kind={entry.kind}
      {...(entry.commandId === undefined
        ? {}
        : { "data-command-id": entry.commandId })}
    >
      <div className="timeline-history__event-copy">
        <span>{entry.label}</span>
        {compact ? null : (
          <small>
            Event #{entry.sequence} · tick {entry.tick}
            {entry.commandId === undefined
              ? ""
              : ` · command ${entry.commandId}`}
          </small>
        )}
      </div>
      <span className="timeline-history__time">
        {entry.simulationTimeHours.toFixed(2)} h
      </span>
    </li>
  );
}
