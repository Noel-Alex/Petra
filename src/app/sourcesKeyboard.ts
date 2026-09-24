export interface SourcesEscapeIntent {
  readonly open: boolean;
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly target: unknown;
}

/**
 * Keyboard planning for the non-modal Sources disclosure.
 * Editable controls and already-consumed Escape events retain first refusal.
 */
export function shouldCloseSourcesOnEscape(
  intent: SourcesEscapeIntent,
): boolean {
  if (!intent.open || intent.key !== "Escape" || intent.defaultPrevented) {
    return false;
  }

  return !isEditableTarget(intent.target);
}

function isEditableTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;

  const candidate = target as {
    readonly tagName?: unknown;
    readonly isContentEditable?: unknown;
    getAttribute?(name: string): string | null;
  };

  if (candidate.isContentEditable === true) return true;

  const tagName =
    typeof candidate.tagName === "string"
      ? candidate.tagName.toLowerCase()
      : "";
  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  ) {
    return true;
  }

  return candidate.getAttribute?.("role") === "textbox";
}
