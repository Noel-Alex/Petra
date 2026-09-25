import { describe, expect, it } from 'vitest'

import {
  PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION,
  PERSISTENCE_SWITCHING_MODE,
  PERSISTENCE_SWITCHING_POLICY_VERSION,
  createPersistenceCompartmentState,
  persistenceSwitchingPolicyIdentity,
  persistenceTotalModelBiomass,
  stepPersistenceSwitching,
  type PersistenceSwitchingPolicy,
} from './persistence'

function policy(
  normalToPersisterPerHour: number,
  persisterToNormalPerHour: number,
): PersistenceSwitchingPolicy {
  return {
    version: PERSISTENCE_SWITCHING_POLICY_VERSION,
    mode: PERSISTENCE_SWITCHING_MODE,
    normalToPersisterPerHour,
    persisterToNormalPerHour,
  }
}

describe('persistence phenotype compartments', () => {
  it('keeps zero-switching state exactly unchanged', () => {
    const initial = createPersistenceCompartmentState({
      normalModelBiomass: 7.5,
      persisterModelBiomass: 2.5,
    })

    const next = stepPersistenceSwitching(initial, policy(0, 0), 24)

    expect(next).toEqual(initial)
    expect(next).not.toBe(initial)
  })

  it('matches exact one-way exponential N to Q switching expectation', () => {
    const initial = createPersistenceCompartmentState({
      normalModelBiomass: 10,
      persisterModelBiomass: 0,
    })

    const next = stepPersistenceSwitching(
      initial,
      policy(Math.log(2), 0),
      1,
    )

    expect(next.normalModelBiomass).toBeCloseTo(5, 12)
    expect(next.persisterModelBiomass).toBeCloseTo(5, 12)
    expect(persistenceTotalModelBiomass(next)).toBeCloseTo(10, 12)
  })

  it('relaxes reversibly toward the exact two-state equilibrium', () => {
    const initial = createPersistenceCompartmentState({
      normalModelBiomass: 8,
      persisterModelBiomass: 0,
    })

    const next = stepPersistenceSwitching(initial, policy(1, 3), 20)

    expect(next.normalModelBiomass).toBeCloseTo(6, 12)
    expect(next.persisterModelBiomass).toBeCloseTo(2, 12)
    expect(persistenceTotalModelBiomass(next)).toBeCloseTo(8, 12)
  })

  it('conserves total model biomass over deterministic repeated stepping', () => {
    const switching = policy(0.07, 0.13)
    let state = createPersistenceCompartmentState({
      normalModelBiomass: 123.25,
      persisterModelBiomass: 6.75,
    })
    const initialTotal = persistenceTotalModelBiomass(state)

    for (let step = 0; step < 1000; step += 1) {
      state = stepPersistenceSwitching(state, switching, 0.01)
    }

    expect(persistenceTotalModelBiomass(state)).toBeCloseTo(
      initialTotal,
      11,
    )

    let replay = createPersistenceCompartmentState({
      normalModelBiomass: 123.25,
      persisterModelBiomass: 6.75,
    })
    for (let step = 0; step < 1000; step += 1) {
      replay = stepPersistenceSwitching(replay, switching, 0.01)
    }
    expect(replay).toEqual(state)
  })

  it('makes switching policy identity rate-sensitive and zero-canonical', () => {
    expect(persistenceSwitchingPolicyIdentity(policy(-0, 0))).toBe(
      'persistence-switching:v1:deterministic-compartment-expectation:n-to-q=0:q-to-n=0',
    )
    expect(persistenceSwitchingPolicyIdentity(policy(0.01, 0.02))).not.toBe(
      persistenceSwitchingPolicyIdentity(policy(0.02, 0.01)),
    )
  })

  it('fails closed on malformed states, policies, and durations', () => {
    const validState = createPersistenceCompartmentState({
      normalModelBiomass: 1,
      persisterModelBiomass: 0,
    })

    expect(() =>
      stepPersistenceSwitching(
        {
          schemaVersion: PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION,
          normalModelBiomass: 1,
          persisterModelBiomass: 0,
          genotypeId: 'must-not-enter-this-kernel',
        },
        policy(0, 0),
        1,
      ),
    ).toThrow(/unsupported field/)

    expect(() =>
      stepPersistenceSwitching(validState, policy(-0.01, 0), 1),
    ).toThrow(/finite and non-negative/)

    expect(() =>
      stepPersistenceSwitching(validState, policy(0, Number.NaN), 1),
    ).toThrow(/finite and non-negative/)

    expect(() =>
      stepPersistenceSwitching(validState, policy(0, 0), -1),
    ).toThrow(/finite and non-negative/)

    expect(() =>
      createPersistenceCompartmentState({
        normalModelBiomass: Number.POSITIVE_INFINITY,
        persisterModelBiomass: 0,
      }),
    ).toThrow(/finite and non-negative/)
  })
})
