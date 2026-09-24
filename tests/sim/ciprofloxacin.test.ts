import { describe, expect, it } from "vitest";
import {
  log10RateToNaturalPerHour,
  micShiftedRegoesResponse,
  naturalRateToLog10PerHour,
  regoesNetRateLog10PerHour,
  type RegoesPharmacodynamics,
} from "../../src/sim/pharmacodynamics/ciprofloxacin";

const REGOES_CAB1_CIPRO: RegoesPharmacodynamics = {
  psiMaxLog10PerHour: 0.88,
  psiMinLog10PerHour: -6.5,
  kappa: 1.1,
  zMic: 0.017,
};

const REFERENCE_MIC = 0.03;

describe("Regoes ciprofloxacin pharmacodynamics", () => {
  it("recovers the drug-free maximum at zero concentration", () => {
    expect(regoesNetRateLog10PerHour(0, REGOES_CAB1_CIPRO)).toBe(0.88);
  });

  it("crosses zero at zMIC by construction", () => {
    expect(regoesNetRateLog10PerHour(REGOES_CAB1_CIPRO.zMic, REGOES_CAB1_CIPRO)).toBeCloseTo(0, 12);
  });

  it("approaches the finite high-concentration lower asymptote", () => {
    const response = regoesNetRateLog10PerHour(1e12, REGOES_CAB1_CIPRO);
    expect(response).toBeCloseTo(REGOES_CAB1_CIPRO.psiMinLog10PerHour, 6);
  });

  it("converts rate conventions without changing population dynamics", () => {
    const sourceRate = -1.75;
    const natural = log10RateToNaturalPerHour(sourceRate);
    expect(naturalRateToLog10PerHour(natural)).toBeCloseTo(sourceRate, 14);
  });

  it("shifts the response horizontally by genotype MIC ratio", () => {
    const wt = micShiftedRegoesResponse(0.1, REGOES_CAB1_CIPRO, REFERENCE_MIC, 0.016);
    const resistant = micShiftedRegoesResponse(0.1, REGOES_CAB1_CIPRO, REFERENCE_MIC, 1.0);

    expect(wt.effectiveZMic).toBeCloseTo(0.017 * (0.016 / 0.03), 14);
    expect(resistant.effectiveZMic).toBeCloseTo(0.017 * (1.0 / 0.03), 14);
    expect(resistant.netRateLog10PerHour).toBeGreaterThan(wt.netRateLog10PerHour);
    expect(resistant.netRateLog10PerHour).toBeLessThanOrEqual(REGOES_CAB1_CIPRO.psiMaxLog10PerHour);
  });

  it("does not turn resistance into immunity at sufficiently high concentration", () => {
    const resistant = micShiftedRegoesResponse(1e9, REGOES_CAB1_CIPRO, REFERENCE_MIC, 32);
    expect(resistant.netRateLog10PerHour).toBeCloseTo(REGOES_CAB1_CIPRO.psiMinLog10PerHour, 4);
  });

  it("rejects physically invalid inputs", () => {
    expect(() => regoesNetRateLog10PerHour(-0.1, REGOES_CAB1_CIPRO)).toThrow(RangeError);
    expect(() => micShiftedRegoesResponse(0.1, REGOES_CAB1_CIPRO, 0, 1)).toThrow(RangeError);
    expect(() => micShiftedRegoesResponse(0.1, REGOES_CAB1_CIPRO, 0.03, 0)).toThrow(RangeError);
  });
});
