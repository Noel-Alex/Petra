import { describe, expect, it } from "vitest";

import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import {
  closeSourcesSurface,
  completeSourcesExit,
  createSourcesSurfaceLifecycle,
  openSourcesSurface,
  sourcesExitDelayMs,
} from "./sourcesLifecycle";

describe("Sources presentation lifecycle", () => {
  it("keeps Full-motion close mounted only through the shared exit plan", () => {
    const hidePlan = planSurfaceTransition({
      surface: "panel",
      action: "hide",
      preference: "full",
    });
    const opened = openSourcesSurface(createSourcesSurfaceLifecycle());
    const exiting = closeSourcesSurface(opened, hidePlan);

    expect(exiting).toMatchObject({
      requestedOpen: false,
      mounted: true,
      phase: "exiting",
    });
    expect(sourcesExitDelayMs(exiting, hidePlan)).toBe(hidePlan.durationMs);

    const settled = completeSourcesExit(exiting, exiting.generation);
    expect(settled).toMatchObject({
      requestedOpen: false,
      mounted: false,
      phase: "closed",
    });
  });

  it.each(["reduced", "off"] as const)(
    "closes immediately for %s motion",
    (preference) => {
      const hidePlan = planSurfaceTransition({
        surface: "panel",
        action: "hide",
        preference,
      });
      const opened = openSourcesSurface(createSourcesSurfaceLifecycle());
      const closed = closeSourcesSurface(opened, hidePlan);

      expect(hidePlan.keepMountedDuringExit).toBe(false);
      expect(closed).toMatchObject({
        requestedOpen: false,
        mounted: false,
        phase: "closed",
      });
      expect(sourcesExitDelayMs(closed, hidePlan)).toBeNull();
    },
  );

  it("ignores stale exit completion after a rapid close then reopen", () => {
    const hidePlan = planSurfaceTransition({
      surface: "panel",
      action: "hide",
      preference: "full",
    });
    const opened = openSourcesSurface(createSourcesSurfaceLifecycle());
    const exiting = closeSourcesSurface(opened, hidePlan);
    const reopened = openSourcesSurface(exiting);

    expect(reopened).toMatchObject({
      requestedOpen: true,
      mounted: true,
      phase: "visible",
    });
    expect(completeSourcesExit(reopened, exiting.generation)).toBe(reopened);
  });

  it("settles an existing exit immediately when motion preference stops allowing exit travel", () => {
    const fullHide = planSurfaceTransition({
      surface: "panel",
      action: "hide",
      preference: "full",
    });
    const offHide = planSurfaceTransition({
      surface: "panel",
      action: "hide",
      preference: "off",
    });
    const exiting = closeSourcesSurface(
      openSourcesSurface(createSourcesSurfaceLifecycle()),
      fullHide,
    );

    expect(sourcesExitDelayMs(exiting, offHide)).toBe(0);
  });
});
