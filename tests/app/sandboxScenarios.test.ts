import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'
import { describe, expect, it } from 'vitest'
import {
  BUNDLED_SANDBOX_SCENARIOS,
  planSandboxScenarioSelection,
  projectSandboxActiveRun,
  type UnavailableSandboxScenario,
} from '../../src/app/sandboxScenarios'
import { COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'

describe('Sandbox scenario selection authority', () => {
  it('projects the bundled option from the versioned flagship preset', () => {
    const scenario = BUNDLED_SANDBOX_SCENARIOS[0]!

    expect(BUNDLED_SANDBOX_SCENARIOS).toHaveLength(1)
    expect(scenario).toMatchObject({
      key: `${flagshipScenario.id}@${flagshipScenario.version}`,
      scenarioId: flagshipScenario.id,
      scenarioVersion: flagshipScenario.version,
      title: flagshipScenario.title,
      status: flagshipScenario.status,
      warning: flagshipScenario.warning,
      seedPolicy: flagshipScenario.seedPolicy,
      availability: 'available',
      executionProfileId: flagshipScenario.executionProfile.id,
      executionProfileVersion: flagshipScenario.executionProfile.version,
      parameterSetId: flagshipScenario.composedParameterSet.id,
      parameterSetVersion: flagshipScenario.composedParameterSet.version,
      resourceContextVersion:
        flagshipScenario.environment.resourceContext.version,
      resourceBindingStatus:
        flagshipScenario.environment.resourceContext.bindingStatus,
    })

    // Physical model-resource calibration and product runtime availability are
    // intentionally separate concepts.
    expect(scenario.resourceBindingStatus).toBe('unbound')
    expect(scenario.availability).toBe('available')
  })

  it('plans an accepted selection only as a fresh-run request', () => {
    const scenario = BUNDLED_SANDBOX_SCENARIOS[0]!
    const plan = planSandboxScenarioSelection({
      scenarioKey: scenario.key,
      seed: 0x5eed1234,
    })

    expect(plan).toMatchObject({
      kind: 'fresh-run',
      mode: 'sandbox',
      scenarioKey: scenario.key,
      scenarioId: flagshipScenario.id,
      scenarioVersion: flagshipScenario.version,
      parameterSetId: flagshipScenario.composedParameterSet.id,
      parameterSetVersion: flagshipScenario.composedParameterSet.version,
      seed: 0x5eed1234,
    })
    expect(plan).not.toHaveProperty('mutate')
    expect(plan).not.toHaveProperty('checkpoint')
  })

  it('refuses unavailable scenarios, unknown keys, and invalid seeds', () => {
    const unavailable: UnavailableSandboxScenario = {
      key: 'future@1',
      scenarioId: 'future',
      scenarioVersion: '1',
      title: 'Future scenario',
      status: 'experimental',
      warning: 'This scenario is metadata-only until its runtime is reviewed.',
      seedPolicy: 'user',
      executionProfileId: null,
      executionProfileVersion: null,
      parameterSetId: null,
      parameterSetVersion: null,
      parameterEvidenceClass: null,
      resourceContextVersion: null,
      resourceBindingStatus: null,
      availability: 'unavailable',
      unavailableReason: 'No authoritative runtime binding is registered.',
    }

    expect(
      planSandboxScenarioSelection({
        scenarios: [unavailable],
        scenarioKey: unavailable.key,
        seed: 1,
      }),
    ).toEqual({
      kind: 'refused',
      scenarioKey: unavailable.key,
      reason: unavailable.unavailableReason,
    })

    expect(
      planSandboxScenarioSelection({
        scenarioKey: 'missing@1',
        seed: 1,
      }),
    ).toMatchObject({ kind: 'refused', reason: 'Unknown Sandbox scenario.' })

    expect(
      planSandboxScenarioSelection({
        scenarioKey: BUNDLED_SANDBOX_SCENARIOS[0]!.key,
        seed: -1,
      }),
    ).toMatchObject({
      kind: 'refused',
      reason: 'Seed must be an unsigned 32-bit integer.',
    })
  })

  it('shows active identity only from the matching provenance-bound run', () => {
    const scenario = BUNDLED_SANDBOX_SCENARIOS[0]!
    if (scenario.availability !== 'available') {
      throw new Error('expected bundled flagship scenario to be available')
    }

    const identity = createRunIdentity({
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      parameterSetId: scenario.parameterSetId,
      parameterSetVersion: scenario.parameterSetVersion,
      parameterSetBinding: {
        schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
        authority: 'provenance',
        parameterSetId: scenario.parameterSetId,
        parameterSetVersion: scenario.parameterSetVersion,
        configurationFingerprint: 'sandbox-test-fingerprint',
      },
      seed: 11,
    })

    expect(
      projectSandboxActiveRun({
        scenarioKey: scenario.key,
        identity,
      }),
    ).toEqual({
      mode: 'sandbox',
      scenarioKey: scenario.key,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      scenarioTitle: scenario.title,
      status: scenario.status,
      engineVersion: identity.engineVersion,
      protocolVersion: identity.protocolVersion,
      parameterSetId: scenario.parameterSetId,
      parameterSetVersion: scenario.parameterSetVersion,
      configurationFingerprint: 'sandbox-test-fingerprint',
      seed: 11,
    })

    expect(() =>
      projectSandboxActiveRun({
        scenarioKey: scenario.key,
        identity: { ...identity, scenarioVersion: 'wrong-version' },
      }),
    ).toThrow(/does not match the selected scenario binding/)

    expect(() =>
      projectSandboxActiveRun({
        scenarioKey: scenario.key,
        identity: { ...identity, parameterSetBinding: undefined },
      }),
    ).toThrow(/provenance-owned parameter-set binding/)
  })
})
