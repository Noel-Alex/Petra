import type { CSSProperties } from "react";
import type { CausalAnnouncementPlan } from "./motion/announcements";

export interface CausalAnnouncementRegionProps {
  readonly plan: CausalAnnouncementPlan;
}

/**
 * Stable React live-region adapter for the framework-neutral announcement plan.
 *
 * Keep this component mounted across updates. Changing only its text lets
 * assistive technology announce newly accepted authoritative events without
 * coupling narration to animation callbacks or simulator mutation.
 */
export function CausalAnnouncementRegion({
  plan,
}: CausalAnnouncementRegionProps) {
  return (
    <div
      role="status"
      aria-live={plan.liveRegion.politeness}
      aria-atomic={plan.liveRegion.atomic}
      aria-relevant="text"
      data-announcement-presentation={plan.presentation}
      data-first-authority-sequence={plan.firstSequence ?? undefined}
      data-last-authority-sequence={plan.lastSequence ?? undefined}
      style={VISUALLY_HIDDEN}
    >
      {plan.message ?? ""}
    </div>
  );
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
