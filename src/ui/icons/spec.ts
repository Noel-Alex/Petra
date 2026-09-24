import type { EvidenceIconToken } from "../provenance/model";

export const PETRA_ICON_VIEWBOX = [0, 0, 24, 24] as const;

export type PetraIconName =
  | "measured"
  | "derived"
  | "transferred"
  | "calibrated"
  | "model"
  | "engineering"
  | "visual"
  | "experimental"
  | "source"
  | "intervention"
  | "inoculate"
  | "antibiotic"
  | "fungus"
  | "nutrient"
  | "lineage"
  | "inspect"
  | "timeline";

export type IconPrimitive =
  | {
      readonly kind: "line";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly kind: "circle";
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    }
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx?: number;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly (readonly [number, number])[];
      readonly closed?: boolean;
    };

export interface PetraIconSpec {
  readonly name: PetraIconName;
  readonly label: string;
  readonly viewBox: typeof PETRA_ICON_VIEWBOX;
  readonly strokeWidth: number;
  readonly primitives: readonly IconPrimitive[];
}

/**
 * Petra-owned semantic icon geometry.
 *
 * Adapters choose color, but meaning is carried by geometry + accessible label.
 * These are presentation primitives only and have no simulation authority.
 */
export const PETRA_ICONS: Readonly<Record<PetraIconName, PetraIconSpec>> = {
  measured: icon("measured", "Measured evidence", [
    rect(4, 7, 16, 8, 1.5),
    line(7, 7, 7, 11),
    line(10, 7, 10, 10),
    line(13, 7, 13, 11),
    line(16, 7, 16, 10),
  ]),
  derived: icon("derived", "Derived evidence", [
    line(5, 8, 10, 13),
    line(10, 8, 5, 13),
    line(13, 9, 19, 9),
    line(13, 13, 19, 13),
  ]),
  transferred: icon("transferred", "Transferred evidence", [
    line(4, 16, 4, 10),
    line(20, 16, 20, 10),
    poly([[4, 10], [8, 7], [12, 6], [16, 7], [20, 10]]),
    line(8, 16, 8, 12),
    line(16, 16, 16, 12),
  ]),
  calibrated: icon("calibrated", "Calibrated evidence", [
    line(5, 7, 19, 7),
    line(5, 12, 19, 12),
    line(5, 17, 19, 17),
    circle(9, 7, 2),
    circle(15, 12, 2),
    circle(11, 17, 2),
  ]),
  model: icon("model", "Model approximation", [
    circle(6, 12, 2.2),
    circle(12, 6, 2.2),
    circle(18, 12, 2.2),
    circle(12, 18, 2.2),
    line(7.5, 10.5, 10.5, 7.5),
    line(13.5, 7.5, 16.5, 10.5),
    line(16.5, 13.5, 13.5, 16.5),
    line(10.5, 16.5, 7.5, 13.5),
  ]),
  engineering: icon("engineering", "Engineering parameter", [
    circle(12, 12, 3.2),
    line(12, 4, 12, 7),
    line(12, 17, 12, 20),
    line(4, 12, 7, 12),
    line(17, 12, 20, 12),
    line(6.3, 6.3, 8.4, 8.4),
    line(15.6, 15.6, 17.7, 17.7),
    line(17.7, 6.3, 15.6, 8.4),
    line(8.4, 15.6, 6.3, 17.7),
  ]),
  visual: icon("visual", "Visual-only presentation", [
    poly([[3.5, 12], [7, 8.5], [12, 7], [17, 8.5], [20.5, 12], [17, 15.5], [12, 17], [7, 15.5]], true),
    circle(12, 12, 2.6),
  ]),
  experimental: icon("experimental", "Experimental or hypothesis", [
    poly([[9, 4], [15, 4], [15, 9], [19, 18], [17, 20], [7, 20], [5, 18], [9, 9]], true),
    line(8, 15, 16, 15),
    circle(10, 17.3, 0.8),
    circle(14, 17.3, 0.8),
  ]),
  source: icon("source", "Source record", [
    rect(5, 3.5, 14, 17, 2),
    line(8, 8, 16, 8),
    line(8, 12, 16, 12),
    line(8, 16, 13, 16),
  ]),
  intervention: icon("intervention", "Intervention", [
    circle(12, 12, 5.5),
    circle(12, 12, 1.5),
    line(12, 3, 12, 6.5),
    line(12, 17.5, 12, 21),
    line(3, 12, 6.5, 12),
    line(17.5, 12, 21, 12),
  ]),
  inoculate: icon("inoculate", "Inoculate", [
    poly([[5, 6], [8, 3], [17, 12], [14, 15]], true),
    line(13.5, 14.5, 10.5, 17.5),
    circle(9, 19, 1.4),
    circle(13, 20, 1),
    circle(6.5, 17.2, 0.9),
  ]),
  antibiotic: icon("antibiotic", "Antibiotic", [
    rect(4, 8, 16, 8, 4),
    line(12, 8, 12, 16),
    line(6.6, 13.2, 9.4, 10.4),
  ]),
  fungus: icon("fungus", "Fungal placement", [
    line(12, 20, 12, 8),
    poly([[12, 13], [8.5, 10], [6, 7]]),
    poly([[12, 11], [15.5, 8.5], [18, 5.5]]),
    poly([[12, 16], [16, 14], [19, 11]]),
    circle(6, 7, 1.2),
    circle(18, 5.5, 1.2),
    circle(19, 11, 1.2),
  ]),
  nutrient: icon("nutrient", "Nutrient field", [
    circle(8, 9, 2.4),
    circle(15.5, 8, 1.8),
    circle(13.5, 15.5, 2.7),
    circle(6.5, 16.5, 1.4),
  ]),
  lineage: icon("lineage", "Lineage ancestry", [
    circle(6, 6, 1.7),
    circle(12, 12, 1.7),
    circle(18, 8, 1.7),
    circle(18, 17, 1.7),
    line(7.3, 7.2, 10.7, 10.8),
    line(13.5, 11, 16.3, 9),
    line(13.5, 13, 16.3, 16),
  ]),
  inspect: icon("inspect", "Inspect region", [
    circle(10.5, 10.5, 5.5),
    line(14.5, 14.5, 20, 20),
    line(8, 10.5, 13, 10.5),
    line(10.5, 8, 10.5, 13),
  ]),
  timeline: icon("timeline", "Experiment timeline", [
    line(4, 12, 20, 12),
    circle(6, 12, 1.8),
    circle(12, 12, 1.8),
    circle(18, 12, 1.8),
    line(12, 6, 12, 10.2),
  ]),
};

export const PROVENANCE_ICON_MAP: Readonly<Record<EvidenceIconToken, PetraIconName>> = {
  ruler: "measured",
  equation: "derived",
  bridge: "transferred",
  tune: "calibrated",
  model: "model",
  wrench: "engineering",
  eye: "visual",
  flask: "experimental",
};

export function iconSpec(name: PetraIconName): PetraIconSpec {
  return PETRA_ICONS[name];
}

function icon(
  name: PetraIconName,
  label: string,
  primitives: readonly IconPrimitive[],
): PetraIconSpec {
  return {
    name,
    label,
    viewBox: PETRA_ICON_VIEWBOX,
    strokeWidth: 1.8,
    primitives,
  };
}

function line(x1: number, y1: number, x2: number, y2: number): IconPrimitive {
  return { kind: "line", x1, y1, x2, y2 };
}

function circle(cx: number, cy: number, r: number): IconPrimitive {
  return { kind: "circle", cx, cy, r };
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  rx?: number,
): IconPrimitive {
  return rx === undefined
    ? { kind: "rect", x, y, width, height }
    : { kind: "rect", x, y, width, height, rx };
}

function poly(
  points: readonly (readonly [number, number])[],
  closed = false,
): IconPrimitive {
  return closed
    ? { kind: "polyline", points, closed: true }
    : { kind: "polyline", points };
}
