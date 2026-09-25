import { describe, expect, it } from 'vitest'
import {
  advanceAspergillusNo10SurfaceCheckpoint,
  createAspergillusNo10SurfaceCheckpoint,
} from './aspergillusNo10Surface'
import {
  ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID,
  ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION,
  aspergillusNo10SurfaceRuntimeAuthorityConfig,
  checkpointFungalRuntimeAuthorityState,
  disabledFungalRuntimeAuthorityConfig,
  fungalRuntimeAuthorityConfigurationIdentity,
  initializeFungalRuntimeAuthorityCheckpoint,
  parseFungalRuntimeAuthorityConfig,
  restoreFungalRuntimeAuthorityCheckpoint,
} from './runtimeAuthority'

describe('fungal runtime authority envelope', () => {
  it('makes disabled authority an explicit deterministic no-state identity', () => {
    const config = disabledFungalRuntimeAuthorityConfig()
    const identity = fungalRuntimeAuthorityConfigurationIdentity(config)
    const checkpoint = initializeFungalRuntimeAuthorityCheckpoint(config)

    expect(JSON.parse(identity)).toEqual({
      schemaVersion: 1,
      mode: 'disabled',
    })
    expect(checkpoint.state).toBeNull()
    expect(checkpoint.configurationIdentity).toBe(identity)
    expect(() =>
      checkpointFungalRuntimeAuthorityState(
        config,
        createAspergillusNo10SurfaceCheckpoint(40),
      ),
    ).toThrow(/disabled fungal runtime authority cannot carry state/)
  })

  it('binds exact source model, taxon revision, treatment, and physical units into replay identity', () => {
    const config = aspergillusNo10SurfaceRuntimeAuthorityConfig(70)
    const parsedIdentity = JSON.parse(
      fungalRuntimeAuthorityConfigurationIdentity(config),
    ) as Record<string, unknown>

    expect(parsedIdentity).toMatchObject({
      schemaVersion: 1,
      mode: 'aspergillus-no10-surface-source-validation',
      modelId: ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_ID,
      modelVersion: ASPERGILLUS_NO10_SURFACE_RUNTIME_MODEL_VERSION,
      sourcePackId:
        'aspergillus-niger-var-hennebergi-no10_surface-agar_larralde-1997_v1',
      taxonId: 'aspergillus-niger-var-hennebergi-no10',
      treatmentId:
        'aspergillus-niger-var-hennebergi-no10_surface-agar_larralde-1997_v1:central-point:glucose-70-g-per-l',
      glucoseGPerL: 70,
      biologicalTimeUnit: 'h',
      colonyRadiusUnit: 'um',
      plateDiameterUnit: 'cm',
      glucoseTreatmentUnit: 'g/L',
      glucoseSemantics: 'fixed-source-treatment-identity',
    })
    expect(JSON.stringify(parsedIdentity)).not.toContain('model-biomass')
    expect(JSON.stringify(parsedIdentity)).not.toContain('model-resource')

    expect(
      fungalRuntimeAuthorityConfigurationIdentity(
        aspergillusNo10SurfaceRuntimeAuthorityConfig(40),
      ),
    ).not.toBe(fungalRuntimeAuthorityConfigurationIdentity(config))
  })

  it('wraps and restores exact mechanism state without aliasing or changing biology', () => {
    const config = aspergillusNo10SurfaceRuntimeAuthorityConfig(40)
    const surface = advanceAspergillusNo10SurfaceCheckpoint(
      createAspergillusNo10SurfaceCheckpoint(40),
      6,
    )
    const wrapped = checkpointFungalRuntimeAuthorityState(config, surface)
    const restored = restoreFungalRuntimeAuthorityCheckpoint(config, wrapped)

    expect(wrapped.state?.checkpoint).toEqual(surface)
    expect(wrapped.state?.checkpoint).not.toBe(surface)
    expect(restored).toEqual(wrapped)
    expect(restored).not.toBe(wrapped)
    expect(restored.state).not.toBe(wrapped.state)
    expect(restored.state?.checkpoint).not.toBe(wrapped.state?.checkpoint)
    expect(restored.state?.checkpoint.biologicalTimeHours).toBe(6)
    expect(restored.state?.checkpoint.colonyRadiusUm).toBe(
      surface.colonyRadiusUm,
    )
  })

  it('fails closed on stale config identity, treatment drift, and unsupported serialized fields', () => {
    const config = aspergillusNo10SurfaceRuntimeAuthorityConfig(10)
    const checkpoint = initializeFungalRuntimeAuthorityCheckpoint(config)

    expect(() =>
      restoreFungalRuntimeAuthorityCheckpoint(
        aspergillusNo10SurfaceRuntimeAuthorityConfig(40),
        checkpoint,
      ),
    ).toThrow(/configuration identity mismatch/)

    expect(() =>
      checkpointFungalRuntimeAuthorityState(config, {
        ...createAspergillusNo10SurfaceCheckpoint(40),
      }),
    ).toThrow(/does not match configured authority/)

    expect(() =>
      restoreFungalRuntimeAuthorityCheckpoint(config, {
        ...checkpoint,
        rendererHint: 'hyphae',
      }),
    ).toThrow(/unsupported field: rendererHint/)

    expect(() =>
      restoreFungalRuntimeAuthorityCheckpoint(config, {
        ...checkpoint,
        state: {
          ...checkpoint.state,
          checkpoint: {
            ...checkpoint.state!.checkpoint,
            presentationOpacity: 1,
          },
        },
      }),
    ).toThrow(/unsupported field: presentationOpacity/)
  })

  it('strictly parses only the reviewed v1 runtime model contract', () => {
    const config = aspergillusNo10SurfaceRuntimeAuthorityConfig(120)
    expect(parseFungalRuntimeAuthorityConfig(config)).toEqual(config)

    expect(() =>
      parseFungalRuntimeAuthorityConfig({
        ...config,
        glucoseSemantics: 'dynamic-glucose-field',
      }),
    ).toThrow(/unit\/meaning contract mismatch/)

    expect(() =>
      parseFungalRuntimeAuthorityConfig({
        ...config,
        resourceYield: 0.5,
      }),
    ).toThrow(/unsupported field: resourceYield/)

    expect(() =>
      parseFungalRuntimeAuthorityConfig({
        schemaVersion: 1,
        mode: 'generic-fungus',
      }),
    ).toThrow(/unsupported fungal runtime authority mode/)
  })
})
