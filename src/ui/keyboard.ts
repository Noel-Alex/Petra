import type { ExperimentControlAction, PlaybackSpeed } from './experimentControls'

export interface ShortcutContext {
  readonly editableTarget: boolean
}

export function actionForShortcut(
  key: string,
  context: ShortcutContext,
): ExperimentControlAction | null {
  if (context.editableTarget) return null

  if (key === ' ' || key === 'Spacebar') return { type: 'toggle-play' }
  if (key === 'Escape') return { type: 'pause' }
  if (key === '.') return { type: 'step', ticks: 1 }
  if (key === '1') return speedAction(1)
  if (key === '2') return speedAction(4)
  if (key === '3') return speedAction(16)
  return null
}

function speedAction(speed: PlaybackSpeed): ExperimentControlAction {
  return { type: 'set-speed', speed }
}
