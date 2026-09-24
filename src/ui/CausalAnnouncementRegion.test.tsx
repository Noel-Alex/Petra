import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CausalAnnouncementRegion } from "./CausalAnnouncementRegion";
import { planCausalAnnouncements } from "./motion/announcements";

describe("CausalAnnouncementRegion", () => {
  it("renders a polite atomic status region with the planned message", () => {
    const plan = planCausalAnnouncements([
      {
        id: "mutation-7",
        sequence: 7,
        eventKind: "mutation-observed",
      },
    ]);

    const html = renderToStaticMarkup(
      <CausalAnnouncementRegion plan={plan} />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('aria-relevant="text"');
    expect(html).toContain('data-last-authority-sequence="7"');
    expect(html).toContain("Lineage change recorded");
  });

  it("stays mounted but silent when no authoritative event is new", () => {
    const first = planCausalAnnouncements([
      {
        id: "lysis-2",
        sequence: 2,
        eventKind: "lysis-observed",
      },
    ]);
    const silent = planCausalAnnouncements(
      [
        {
          id: "lysis-2",
          sequence: 2,
          eventKind: "lysis-observed",
        },
      ],
      first.nextCursor,
    );

    const html = renderToStaticMarkup(
      <CausalAnnouncementRegion plan={silent} />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('data-announcement-presentation="none"');
    expect(html).not.toContain("Lysis recorded");
  });
});
