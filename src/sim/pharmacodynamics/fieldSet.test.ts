import { describe, expect, it } from "vitest";

import {
  ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION,
  activeAntimicrobialDrugIds,
  assertSingleActiveAntimicrobialOnly,
  createAntimicrobialFieldSet,
  validateAntimicrobialFieldSet,
  type AntimicrobialSpatialField,
} from "./fieldSet";

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
    | readonly ["incremental-loss-hazard"]
    | readonly ["division-multiplier", "incremental-loss-hazard"];
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

describe("multi-antimicrobial field foundation", () => {
  it("preserves distinct exact drug authority, units and mechanism channels", () => {
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
          values: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      ],
      grid,
    );

    expect(set.schemaVersion).toBe(ANTIMICROBIAL_FIELD_SET_SCHEMA_VERSION);
    expect(
      set.fields.map((entry) => [
        entry.authority.drugId,
        entry.authority.authorityId,
        entry.authority.authorityVersion,
        entry.authority.concentrationUnit,
        entry.authority.effectChannels,
      ]),
    ).toEqual([
      [
        "ciprofloxacin",
        "regoes-marcusson-loss-v1",
        "1.0.0",
        "mg/L",
        ["incremental-loss-hazard"],
      ],
      [
        "chloramphenicol",
        "greulich-ribosome-cubic-v1",
        "1.0.1",
        "uM",
        ["division-multiplier"],
      ],
    ]);
    expect(activeAntimicrobialDrugIds(set, grid)).toEqual(["ciprofloxacin"]);
    expect(() => assertSingleActiveAntimicrobialOnly(set, grid)).not.toThrow();
  });

  it("allows prepared zero-valued channels without implying a joint drug effect", () => {
    const set = createAntimicrobialFieldSet(
      [
        field({
          drugId: "ciprofloxacin",
          authorityId: "regoes-marcusson-loss-v1",
          concentrationUnit: "mg/L",
          effectChannels: ["incremental-loss-hazard"],
          values: Array(9).fill(0),
        }),
        field({
          drugId: "chloramphenicol",
          authorityId: "greulich-ribosome-cubic-v1",
          concentrationUnit: "uM",
          effectChannels: ["division-multiplier"],
          values: Array(9).fill(0),
        }),
      ],
      grid,
    );

    expect(activeAntimicrobialDrugIds(set, grid)).toEqual([]);
    expect(() => assertSingleActiveAntimicrobialOnly(set, grid)).not.toThrow();
  });

  it("refuses simultaneous non-zero drugs until explicit joint-composition authority exists", () => {
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

    expect(activeAntimicrobialDrugIds(set, grid)).toEqual([
      "ciprofloxacin",
      "chloramphenicol",
    ]);
    expect(() => assertSingleActiveAntimicrobialOnly(set, grid)).toThrow(
      /requires explicit joint-composition authority/,
    );
  });

  it("requires exact mask alignment and zero concentration outside the dish", () => {
    expect(() =>
      createAntimicrobialFieldSet(
        [
          field({
            drugId: "ciprofloxacin",
            authorityId: "regoes-marcusson-loss-v1",
            concentrationUnit: "mg/L",
            effectChannels: ["incremental-loss-hazard"],
            values: [1, 0, 0, 0, 0, 0, 0, 0, 0],
          }),
        ],
        grid,
      ),
    ).toThrow(/zero outside the authoritative dish mask/);

    const wrongDimensions = field({
      drugId: "ciprofloxacin",
      authorityId: "regoes-marcusson-loss-v1",
      concentrationUnit: "mg/L",
      effectChannels: ["incremental-loss-hazard"],
      values: Array(9).fill(0),
    });
    expect(() =>
      createAntimicrobialFieldSet(
        [{ ...wrongDimensions, width: 2 }],
        grid,
      ),
    ).toThrow(/dimensions must match/);
  });

  it("rejects duplicate drug channels and malformed authority metadata", () => {
    const cipro = field({
      drugId: "ciprofloxacin",
      authorityId: "regoes-marcusson-loss-v1",
      concentrationUnit: "mg/L",
      effectChannels: ["incremental-loss-hazard"],
      values: Array(9).fill(0),
    });
    expect(() =>
      createAntimicrobialFieldSet(
        [
          cipro,
          {
            ...cipro,
            authority: {
              ...cipro.authority,
              authorityVersion: "2.0.0",
            },
          },
        ],
        grid,
      ),
    ).toThrow(/duplicate drugId/);

    expect(() =>
      createAntimicrobialFieldSet(
        [
          {
            ...cipro,
            authority: {
              ...cipro.authority,
              concentrationUnit: " mg/L",
            },
          },
        ],
        grid,
      ),
    ).toThrow(/concentrationUnit must be non-empty canonical text/);
  });

  it("rejects non-finite/negative concentration and invalid effect-channel declarations", () => {
    const negative = field({
      drugId: "ciprofloxacin",
      authorityId: "regoes-marcusson-loss-v1",
      concentrationUnit: "mg/L",
      effectChannels: ["incremental-loss-hazard"],
      values: [0, -1, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(() => createAntimicrobialFieldSet([negative], grid)).toThrow(
      /finite and non-negative/,
    );

    const invalidChannel = field({
      drugId: "ciprofloxacin",
      authorityId: "regoes-marcusson-loss-v1",
      concentrationUnit: "mg/L",
      effectChannels: ["incremental-loss-hazard"],
      values: Array(9).fill(0),
    });
    expect(() =>
      createAntimicrobialFieldSet(
        [
          {
            ...invalidChannel,
            authority: {
              ...invalidChannel.authority,
              effectChannels: ["unsupported"] as never,
            },
          },
        ],
        grid,
      ),
    ).toThrow(/unsupported channel/);
  });

  it("detaches field buffers and authority arrays from caller mutation", () => {
    const source = field({
      drugId: "chloramphenicol",
      authorityId: "greulich-ribosome-cubic-v1",
      concentrationUnit: "uM",
      effectChannels: ["division-multiplier"],
      values: [0, 0, 0, 0, 4, 0, 0, 0, 0],
    });
    const set = createAntimicrobialFieldSet([source], grid);

    source.values[4] = 99;
    (source.authority.effectChannels as unknown as string[])[0] = "incremental-loss-hazard";

    expect(set.fields[0]!.values[4]).toBe(4);
    expect(set.fields[0]!.authority.effectChannels).toEqual([
      "division-multiplier",
    ]);
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(set.fields)).toBe(true);
    expect(Object.isFrozen(set.fields[0]!.authority)).toBe(true);
    expect(Object.isFrozen(set.fields[0]!.authority.effectChannels)).toBe(true);
  });

  it("revalidates externally supplied field sets before activation", () => {
    const set = createAntimicrobialFieldSet(
      [
        field({
          drugId: "ciprofloxacin",
          authorityId: "regoes-marcusson-loss-v1",
          concentrationUnit: "mg/L",
          effectChannels: ["incremental-loss-hazard"],
          values: Array(9).fill(0),
        }),
      ],
      grid,
    );
    const corrupted = {
      ...set,
      fields: [
        {
          ...set.fields[0]!,
          values: Float32Array.from([0, Number.NaN, 0, 0, 0, 0, 0, 0, 0]),
        },
      ],
    };

    expect(() => validateAntimicrobialFieldSet(corrupted, grid)).toThrow(
      /finite and non-negative/,
    );
    expect(() => activeAntimicrobialDrugIds(corrupted, grid)).toThrow(
      /finite and non-negative/,
    );
  });
});
