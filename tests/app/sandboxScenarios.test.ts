import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'
import { describe, expect, it } from 'vitest'
import {
  BUNDLED_SANDBOX_SCENARIOS,
  createSandboxScenarioCatalog,
  planSandboxScenarioSelection,
  projectSandboxActiveRun,
  type SandboxScenarioRecord,
} from '../../src/app/sandboxScenarios'
import { createRunIdentity } from '../../src/sim/protocol'
import { COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION } from '../../src/sim/parameterSetBinding'

function experimentalScenario(): SandboxScenarioRecord {
  return {
    id: 'experimental-scenario',
    version: '1',
    title: 'Experimental scenario',
    status: 'experimental',
    warning: 'This scenario has no authoritative runtime binding yet.',
    seedPolicy: 'user',
    executionProfile: {
      id: 'experimental-profile',
      version: '1',
      classification: 'engineering',
    },
    composedParameterSet: {
      id: 'experimental-parameters',
      version: '1',
      scenarioId: 'experimental-scenario',
      scenarioVersion: '1',
      provenance: { classification: 'engineering' },
    },
    environment: {
      resourceContext: {
        version: 'model-resource-v1',
        bindingStatus: 'unbound',
      },
    },
  }
}

describe('Sandbox scenario authority', () => {
  it('projects the bundled flagship directly from versioned scenario data', () => {
    expect(BUNDLED_SANDBOX_SCENARIOS.registryVersion).toBe(1)
    expect(BUNDLED_SANDBOX_SCENARIOS.scenarios).toHaveLength(1)

    const scenario = BUNDLED_SANDBOX_SCENARIOS.scenarios[0]!
    expect(scenario).toMatchObject({
      key: `${flagshipScenario.id}@${flagshipScenario.version}`,
      scenarioId: flagshipScenario.id,
      scenarioVersion: flagshipScenario.version,
      title: flagshipScenario.title,
      status: flagshipScenario.status,
      warning: flagshipScenario.warning,
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
  })

  it('keeps a scenario unavailable when executable data has no runtime binding', () => {
    const catalog = createSandboxScenarioCatalog([
      { scenario: experimentalScenario() },
    ])
    const scenario = catalog.scenarios[0]!

    expect(scenario.availability).toBe('unavailable')
    if (scenario.availability !== 'unavailable') {
      throw new Error('expected unavailable scenario')
    }
    expect(scenario.unavailableReason).toMatch(/runtime binding/)
    expect(
      planSandboxScenarioSelection({
        catalog,
        scenarioKey: scenario.key,
        seed: 7,
      }),
    ).toEqual({
      kind: 'refused',
      scenarioKey: scenario.key,
      reason: scenario.unavailableReason,
    })
  })

  it('fails closed when a runtime binding aliases another scenario or parameter set', () => {
    const scenario = experimentalScenario()

    expect(() =>
      createSandboxScenarioCatalog([
        {
          scenario,
          authoritativeBinding: {
            runtimeId: 'test-runtime',
            scenarioId: scenario.id,
            scenarioVersion: 'other',
            parameterSetId: scenario.composedParameterSet!.id,
            parameterSetVersion: scenario.composedParameterSet!.version,
          },
        },
      ]),
    ).toThrow(/match scenario id\/version/)

    expect(() =>
      createSandboxScenarioCatalog([
        {
          scenario,
          authoritativeBinding: {
            runtimeId: 'test-runtime',
            scenarioId: scenario.id,
            scenarioVersion: scenario.version,
            parameterSetId: 'other',
            parameterSetVersion: scenario.composedParameterSet!.version,
          },
        },
      ]),
    ).toThrow(/match the scenario parameter set/)
  })

  it('accepts selection only as an explicit fresh-run request', () => {
    const scenario = BUNDLED_SANDBOX_SCENARIOS.scenarios[0]!
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
    expect(
      planSandboxScenarioSelection({
        scenarioKey: scenario.key,
        seed: -1,
      }),
    ).toMatchObject({
      kind: 'refused',
      reason: expect.stringMatching(/unsigned 32-bit integer/),
    })
  })

  it('projects active display identity only from a matching provenance-bound run', () => {
    const scenario = BUNDLED_SANDBOX_SCENARIOS.scenarios[0]!
    if (scenario.availability !== 'available') {
      throw new Error('expected bundled flagship to be available')
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
    ).toMatchObject({
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
  })

  it('rejects duplicate scenario identities and unsupported seed-policy adapters', () => {
    const scenario = experimentalScenario()
    expect(() =>
      createSandboxScenarioCatalog([
        { scenario },
        { scenario: { ...scenario } },
      ]),
    ).toThrow(/duplicate sandbox scenario registration/)

    const fixedSeed = {
      ...scenario,
      id: 'fixed-seed-scenario',
      seedPolicy: 'fixed-demo',
      composedParameterSet: {
        ...scenario.composedParameterSet!,
        scenarioId: 'fixed-seed-scenario',
      },
    }
    const catalog = createSandboxScenarioCatalog([
      {
        scenario: fixedSeed,
        authoritativeBinding: {
          runtimeId: 'fixed-seed-runtime',
          scenarioId: fixedSeed.id,
          scenarioVersion: fixedSeed.version,
          parameterSetId: fixedSeed.composedParameterSet.id,
          parameterSetVersion: fixedSeed.composedParameterSet.version,
        },
      },
    ])

    expect(catalog.scenarios[0]).toMatchObject({
      availability: 'unavailable',
      unavailableReason: expect.stringMatching(/seed policy/),
    })
  })
})
