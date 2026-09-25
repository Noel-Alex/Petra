import { describe, expect, it } from "vitest";

import {
  createAntimicrobialFieldSet,
  type AntimicrobialFieldSet,
  type AntimicrobialSpatialField,
} from "../sim/pharmacodynamics/fieldSet";
import {
  antimicrobialRenderFieldId,
  projectAntimicrobialFieldsForRender,
} from "./antimicrobialFieldRenderProjection";

const grid = Object.freeze({
  width: 3,
  height: 3,
  dishMask: Object.freeze([
    0, 1, 0,
    1, 1, 1,
    0, 1, 0,
  ]),
});

function field(args: {
  drugId: string;
  authorityId: string;
  authorityVersion?: string;
  concentrationUnit: string;
  effectChannels:
    | readonly ["division-multiplier"]
    | readonly ["incremental-loss-hazard"];
  values: readonly number[];
}): AntimicrobialSpatialField {
  return {
    authority: {
      drugId: args.drugId,
      authorityId: args.authorityId,
      authorityVersion: args.authorityVersion ?? "1.0.0",
      concentrationUnit: args.concentrationUnit,
      effectChannels: args.effectChannels,
    },
    width: grid.width,
    height: grid.height,
    values: Float32Array.from(args.values),
  };
}

describe("antimicrobial field render projection", () => {
  it("preserves exact native units and authority identity across distinct prepared drug channels", () => {
    const set = createAntimicrobialFieldSet(
      [
        field({
          drugId: "ciprofloxacin",
          authorityId: "regoes-marcusson-loss-v1",
          concentrationUnit: "mg/L",
          effectChannels: ["incremental-loss-hazard"],
          values: [0, 0.25, 0, 0, 0.5, 0, 0, 0, 0],
        }),
        field({
          drugId: "chloramphenicol",
          authorityId: "greulich-ribosome-cubic-v1",
          authorityVersion: "1.0.1",
          concentrationUnit: "uM",
          effectChannels: ["division-multiplier"],
          values: Array(9).fill(0),
        }),
      ],
      grid,
    );

    const projected = projectAntimicrobialFieldsForRender(set, grid);

    expect(projected).toHaveLength(2);
    expect(projected[0]).toMatchObject({
      id: "authoritative-antimicrobial:ciprofloxacin:regoes-marcusson-loss-v1:1.0.0",
      kind: "antibiotic",
      label: "ciprofloxacin",
      unit: "mg/L",
      width: 3,
      height: 3,
      rangeMode: "snapshot-extrema",
      minimum: 0,
      maximum: 0.5,
    });
    expect(projected[1]).toMatchObject({
      id: "authoritative-antimicrobial:chloramphenicol:greulich-ribosome-cubic-v1:1.0.1",
      kind: "antibiotic",
      label: "chloramphenicol",
      unit: "uM",
      width: 3,
      height: 3,
      rangeMode: "snapshot-extrema",
      minimum: 0,
      maximum: 0,
    });
  });

  it("computes snapshot extrema from in-mask values only", () => {
    const set = createAntimicrobialFieldSet(
      [
        field({
          drugId: "ciprofloxacin",
          authorityId: "regoes-marcusson-loss-v1",
          concentrationUnit: "mg/L",
          effectChannels: ["incremental-loss-hazard"],
          values: [
            0, 0.25, 0,
            0.5, 0.75, 1,
            0, 1.25, 0,
          ],
        }),
      ],
      grid,
    );

    const [projected] = projectAntimicrobialFieldsForRender(set, grid);

    expect(projected?.minimum).toBe(0.25);
    expect(projected?.maximum).toBe(1.25);
  });

  it("changes render identity when the exact authority version changes", () => {
    const authorityV1 = field({
      drugId: "chloramphenicol",
      authorityId: "greulich-ribosome-cubic-v1",
      authorityVersion: "1.0.1",
      concentrationUnit: "uM",
      effectChannels: ["division-multiplier"],
      values: Array(9).fill(0),
    }).authority;
    const authorityV2 = {
      ...authorityV1,
      authorityVersion: "2.0.0",
    };

    expect(antimicrobialRenderFieldId(authorityV1)).not.toBe(
      antimicrobialRenderFieldId(authorityV2),
    );
  });

  it("refuses simultaneous non-zero drug fields until joint-composition authority exists", () => {
    const set = createAntimicrobialFieldSet(
      [
        field({
          drugId: "ciprofloxacin",
          authorityId: "regoes-marcusson-loss-v1",
          concentrationUnit: "mg/L",
          effectChannels: ["incremental-loss-hazard"],
          values: [0, 0.25, 0, 0, 0, 0, 0, 0, 0],
        }),
        field({
          drugId: "chloramphenicol",
          authorityId: "greulich-ribosome-cubic-v1",
          concentrationUnit: "uM",
          effectChannels: ["division-multiplier"],
          values: [0, 0, 0, 0, 4, 0, 0, 0, 0],
        }),
      ],
      grid,
    );

    expect(() => projectAntimicrobialFieldsForRender(set, grid)).toThrow(
      /requires explicit joint-composition authority/,
    );
  });

  it("revalidates externally supplied malformed/off-mask state", () => {
    const malformed: AntimicrobialFieldSet = {
      schemaVersion: 1,
      fields: [
        field({
          drugId: "ciprofloxacin",
          authorityId: "regoes-marcusson-loss-v1",
          concentrationUnit: "mg/L",
          effectChannels: ["incremental-loss-hazard"],
          values: [1, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      ],
    };

    expect(() => projectAntimicrobialFieldsForRender(malformed, grid)).toThrow(
      /zero outside the authoritative dish mask/,
    );
  });

  it("detaches projected values from caller-owned field storage", () => {
    const set = createAntimicrobialFieldSet(
      [
        field({
          drugId: "chloramphenicol",
          authorityId: "greulich-ribosome-cubic-v1",
          authorityVersion: "1.0.1",
          concentrationUnit: "uM",
          effectChannels: ["division-multiplier"],
          values: [0, 0, 0, 0, 4, 0, 0, 0, 0],
        }),
      ],
      grid,
    );

    const projected = projectAntimicrobialFieldsForRender(set, grid);
    set.fields[0]!.values[4] = 99;

    expect(projected[0]!.values[4]).toBe(4);
  });

  it("refuses a field projection with no authoritative in-mask cells", () => {
    const emptyGrid = {
      width: 2,
      height: 2,
      dishMask: [0, 0, 0, 0],
    };
    const set = createAntimicrobialFieldSet(
      [
        {
          authority: {
            drugId: "ciprofloxacin",
            authorityId: "regoes-marcusson-loss-v1",
            authorityVersion: "1.0.0",
            concentrationUnit: "mg/L",
            effectChannels: ["incremental-loss-hazard"],
          },
          width: 2,
          height: 2,
          values: new Float32Array(4),
        },
      ],
      emptyGrid,
    );

    expect(() =>
      projectAntimicrobialFieldsForRender(set, emptyGrid),
    ).toThrow(/requires at least one authoritative in-mask cell/);
  });
});
