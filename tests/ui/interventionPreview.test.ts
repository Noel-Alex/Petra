import { describe, expect, it } from 'vitest'
import {
  createInterventionPreview,
  interventionPreviewActionForKey,
  type InterventionDraft,
} from '../../src/ui/interventionPreview'

const radialDose: InterventionDraft = {
  intentId: 'dose-1',
  tool: 'antibiotic',
  geometry: {
    kind: 'radial',
    center: { x: 0.25, y: 0.75 },
    radiusFraction: 0.2,
  },
  parameters: [
    {
      key: 'concentration',
      label: 'Ciprofloxacin concentration',
      value: 0.125,
      unit: 'mg/L',
      precision: 3,
      min: 0,
      max: 2,
    },
  ],
}

describe('intervention preview planning', () => {
  it('preserves exact numeric meaning and emits a UI intent without fabricating a worker command', () => {
    const preview = createInterventionPreview(radialDose, 'full')

    expect(preview.status).toBe('valid')
    expect(preview.canCommit).toBe(true)
    expect(preview.readouts).toEqual([
      {
        key: 'concentration',
        label: 'Ciprofloxacin concentration',
        value: 0.125,
        unit: 'mg/L',
        formattedValue: '0.125 mg/L',
      },
    ])
    expect(preview.commitIntent).toEqual({
      type: 'apply-intervention',
      intentId: 'dose-1',
      tool: 'antibiotic',
      geometry: radialDose.geometry,
      parameters: [{ key: 'concentration', value: 0.125, unit: 'mg/L' }],
    })
    expect(preview.feedback).toMatchObject({
      visual: 'geometry-outline',
      treatment: 'animate',
      durationMs: 160,
      meaning: 'presentation-only',
    })
    expect(preview.accessibleSummary).toContain('Ready to apply')
    expect(preview.announceOnPointerMove).toBe(false)
  })

  it('keeps scientific meaning when motion is reduced or off', () => {
    const reduced = createInterventionPreview(radialDose, 'reduced')
    const off = createInterventionPreview(radialDose, 'off')

    expect(reduced.feedback.treatment).toBe('instant')
    expect(reduced.feedback.durationMs).toBe(0)
    expect(off.feedback.treatment).toBe('instant')
    expect(off.feedback.durationMs).toBe(0)
    expect(reduced.readouts).toEqual(off.readouts)
    expect(reduced.accessibleSummary).toEqual(off.accessibleSummary)
  })

  it('blocks commit when geometry or supplied scenario bounds are invalid', () => {
    const preview = createInterventionPreview(
      {
        ...radialDose,
        geometry: {
          kind: 'radial',
          center: { x: 1.2, y: 0.5 },
          radiusFraction: 0,
        },
        parameters: [
          {
            key: 'concentration',
            label: 'Ciprofloxacin concentration',
            value: 3,
            unit: 'mg/L',
            min: 0,
            max: 2,
          },
        ],
      },
      'full',
    )

    expect(preview.status).toBe('invalid')
    expect(preview.canCommit).toBe(false)
    expect(preview.commitIntent).toBeNull()
    expect(preview.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['invalid-geometry', 'parameter-out-of-range']),
    )
    expect(preview.accessibleSummary).toContain('Not ready to apply')
  })

  it('requires visible numeric meaning before an intervention can be applied', () => {
    const preview = createInterventionPreview(
      {
        intentId: 'inoculate-1',
        tool: 'inoculate',
        geometry: { kind: 'point', point: { x: 0.5, y: 0.5 } },
        parameters: [],
      },
      'full',
    )

    expect(preview.canCommit).toBe(false)
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: 'missing-parameter' }),
    )
  })
})

describe('intervention tool keyboard semantics', () => {
  it('lets an active tool consume Escape before the global pause shortcut', () => {
    expect(
      interventionPreviewActionForKey('Escape', {
        toolActive: true,
        editableTarget: true,
      }),
    ).toBe('cancel')
  })

  it('commits with Enter only when focus is not editing a value', () => {
    expect(
      interventionPreviewActionForKey('Enter', {
        toolActive: true,
        editableTarget: false,
      }),
    ).toBe('commit')
    expect(
      interventionPreviewActionForKey('Enter', {
        toolActive: true,
        editableTarget: true,
      }),
    ).toBeNull()
    expect(
      interventionPreviewActionForKey('Escape', {
        toolActive: false,
        editableTarget: false,
      }),
    ).toBeNull()
  })
})
