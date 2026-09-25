import type { ReactElement } from "react";

import type { InterventionTool } from "../ui/interventionPreview";

export function InterventionIllustration({
  tool,
}: {
  readonly tool: InterventionTool;
}): ReactElement {
  return (
    <svg
      className="intervention-illustration"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      {tool === "inoculate" ? <PopulationIllustration /> : null}
      {tool === "fungus" ? <FungusIllustration /> : null}
      {tool === "antibiotic" ? <MedicineIllustration /> : null}
      {tool === "nutrient" ? <NutrientIllustration /> : null}
    </svg>
  );
}

export function PetraBrandMark(): ReactElement {
  return (
    <svg
      className="petra-brand-glyph"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9.5 16.7 18.7 10.5M11.2 18.8l7.4 3.4M20.4 12.7l1.4 5.1"
        fill="none"
        stroke="var(--petra-color-mint)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="8"
        cy="17"
        rx="7"
        ry="4.7"
        transform="rotate(-38 8 17)"
        fill="var(--petra-color-mint)"
      />
      <circle cx="22.8" cy="9.5" r="4.2" fill="var(--petra-color-mint)" />
      <ellipse
        cx="21"
        cy="22"
        rx="5.4"
        ry="4"
        transform="rotate(28 21 22)"
        fill="var(--petra-color-mint)"
      />
      <circle cx="28" cy="17" r="1.8" fill="var(--petra-color-teal)" />
    </svg>
  );
}

export function PetraProfileGlyph(): ReactElement {
  return (
    <svg
      className="petra-profile-glyph"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="20" r="19" fill="var(--petra-color-ink-soft)" />
      <circle cx="20" cy="15" r="5" fill="var(--petra-color-cream-muted)" />
      <path
        d="M9.5 31.3c1-5 4.8-7.8 10.5-7.8s9.5 2.8 10.5 7.8c-2.8 2.2-6.3 3.4-10.5 3.4s-7.7-1.2-10.5-3.4Z"
        fill="var(--petra-color-cream-muted)"
      />
    </svg>
  );
}

export function InspectorSelectionGlyph(): ReactElement {
  return (
    <svg
      className="inspector-selection-glyph"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="22"
        cy="22"
        r="15"
        fill="none"
        stroke="var(--petra-color-teal)"
        strokeOpacity=".28"
        strokeWidth="1.4"
      />
      <circle
        cx="22"
        cy="22"
        r="8.5"
        fill="var(--petra-color-ink-soft)"
        stroke="var(--petra-color-teal)"
        strokeOpacity=".9"
        strokeWidth="2"
      />
      <path
        d="M28.3 28.3 37 37M18.5 22h7M22 18.5v7"
        fill="none"
        stroke="var(--petra-color-cream)"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx="22" cy="22" r="2" fill="var(--petra-color-mint)" />
    </svg>
  );
}

function PopulationIllustration(): ReactElement {
  return (
    <>
      <ellipse
        cx="32"
        cy="52"
        rx="21"
        ry="3.5"
        fill="var(--petra-color-ink-deep)"
        opacity=".45"
      />
      <g transform="rotate(-38 24 33)">
        <rect
          x="11"
          y="26"
          width="25"
          height="13"
          rx="6.5"
          fill="var(--petra-color-coral)"
          stroke="var(--petra-color-ink-deep)"
          strokeOpacity=".38"
          strokeWidth="1.5"
        />
        <path
          d="M16 30c2.5-1.7 6.3-1.9 9-.8"
          fill="none"
          stroke="var(--petra-color-cream)"
          strokeLinecap="round"
          strokeOpacity=".62"
          strokeWidth="1.7"
        />
      </g>
      <g transform="rotate(31 42 24)">
        <rect
          x="33"
          y="19"
          width="18"
          height="11"
          rx="5.5"
          fill="var(--petra-color-coral)"
          stroke="var(--petra-color-ink-deep)"
          strokeOpacity=".38"
          strokeWidth="1.4"
        />
        <path
          d="M37 22c2-.9 4.4-.9 6.2-.2"
          fill="none"
          stroke="var(--petra-color-cream)"
          strokeLinecap="round"
          strokeOpacity=".58"
          strokeWidth="1.4"
        />
      </g>
      <g transform="rotate(-18 42 44)">
        <rect
          x="32"
          y="38"
          width="21"
          height="12"
          rx="6"
          fill="var(--petra-color-coral)"
          stroke="var(--petra-color-ink-deep)"
          strokeOpacity=".38"
          strokeWidth="1.4"
        />
        <path
          d="M36 41c2.3-1.1 5.3-1.3 7.8-.3"
          fill="none"
          stroke="var(--petra-color-cream)"
          strokeLinecap="round"
          strokeOpacity=".55"
          strokeWidth="1.5"
        />
      </g>
      <circle cx="23" cy="18" r="3.6" fill="var(--petra-color-coral)" />
      <circle cx="54" cy="34" r="3.1" fill="var(--petra-color-coral)" />
      <circle cx="15" cy="43" r="2.7" fill="var(--petra-color-coral)" />
      <circle cx="23" cy="17" r="1.1" fill="var(--petra-color-cream)" opacity=".68" />
      <circle cx="53.5" cy="33.3" r=".9" fill="var(--petra-color-cream)" opacity=".68" />
    </>
  );
}

function FungusIllustration(): ReactElement {
  return (
    <>
      <ellipse
        cx="31"
        cy="52"
        rx="18"
        ry="3.2"
        fill="var(--petra-color-ink-deep)"
        opacity=".42"
      />
      <path
        d="M26 34h13v7.8c0 3.3 1.1 6.1 3.6 9.5H20.5c2.4-3.4 3.5-6.2 3.5-9.5V34Z"
        fill="var(--petra-color-cream)"
        stroke="var(--petra-color-amber)"
        strokeOpacity=".82"
        strokeWidth="1.4"
      />
      <path
        d="M15 31.3c0-10 7.4-18.3 17.4-18.3S50 21.3 50 31.3c0 3.4-4.6 5-17.5 5S15 34.7 15 31.3Z"
        fill="var(--petra-color-amber)"
        stroke="var(--petra-color-ink-deep)"
        strokeOpacity=".34"
        strokeWidth="1.5"
      />
      <path
        d="M21 29c1.8-5.3 5.8-8.2 11.5-8.5"
        fill="none"
        stroke="var(--petra-color-cream)"
        strokeLinecap="round"
        strokeOpacity=".58"
        strokeWidth="2"
      />
      <path
        d="M25 37c3.3 1.2 7.2 1.5 11.3.6"
        fill="none"
        stroke="var(--petra-color-amber)"
        strokeLinecap="round"
        strokeOpacity=".7"
        strokeWidth="1.2"
      />
      <circle
        cx="49"
        cy="46"
        r="7"
        fill="var(--petra-color-amber)"
        stroke="var(--petra-color-ink-deep)"
        strokeOpacity=".36"
        strokeWidth="1.4"
      />
      <circle cx="53.8" cy="40.8" r="3" fill="var(--petra-color-cream)" />
      <circle cx="47" cy="43.5" r="1.5" fill="var(--petra-color-cream)" opacity=".72" />
    </>
  );
}

function MedicineIllustration(): ReactElement {
  return (
    <>
      <ellipse
        cx="32"
        cy="49"
        rx="21"
        ry="4"
        fill="var(--petra-color-ink-deep)"
        opacity=".42"
      />
      <g transform="rotate(-43 32 31)">
        <rect
          x="13"
          y="22"
          width="38"
          height="19"
          rx="9.5"
          fill="var(--petra-color-mint)"
          stroke="var(--petra-color-ink-deep)"
          strokeOpacity=".44"
          strokeWidth="1.5"
        />
        <path
          d="M32 22h9.5a9.5 9.5 0 0 1 0 19H32V22Z"
          fill="var(--petra-color-teal)"
        />
        <path
          d="M32 22v19"
          stroke="var(--petra-color-ink-deep)"
          strokeOpacity=".46"
          strokeWidth="1.5"
        />
        <path
          d="M19 27c2.3-2 5.5-2.5 8.2-1.5"
          fill="none"
          stroke="var(--petra-color-cream)"
          strokeLinecap="round"
          strokeOpacity=".74"
          strokeWidth="2"
        />
      </g>
    </>
  );
}

function NutrientIllustration(): ReactElement {
  return (
    <>
      <path
        d="M13 42c8-7 25-10 38-3"
        fill="none"
        stroke="var(--petra-color-olive)"
        strokeOpacity=".38"
        strokeWidth="2"
        strokeDasharray="1 5"
        strokeLinecap="round"
      />
      <circle cx="22" cy="19" r="7.5" fill="var(--petra-color-olive)" />
      <circle cx="42" cy="17" r="5.4" fill="var(--petra-color-mint)" />
      <circle cx="34" cy="39" r="8.7" fill="var(--petra-color-olive)" />
      <circle cx="15" cy="43" r="4.6" fill="var(--petra-color-mint)" />
      <circle cx="50" cy="42" r="4.1" fill="var(--petra-color-amber)" />
      <circle cx="20" cy="16.8" r="2" fill="var(--petra-color-cream)" opacity=".67" />
      <circle cx="40.5" cy="15.5" r="1.5" fill="var(--petra-color-cream)" opacity=".72" />
      <circle cx="31.5" cy="36.3" r="2.3" fill="var(--petra-color-cream)" opacity=".62" />
      <circle cx="13.7" cy="41.6" r="1.4" fill="var(--petra-color-cream)" opacity=".72" />
    </>
  );
}
