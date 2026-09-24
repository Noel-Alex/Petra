import { describe, expect, it } from 'vitest'

import { buildDefaultFlagshipRun } from './flagshipRunPreset'
import { createFlagshipExperimentRuntime } from './flagshipRuntime'
import { WorkerSession, type WorkerPort } from './workerSession'

function createIdleSession(): WorkerSession {
  const port: WorkerPort = {
    post() {},
    subscribe() {
      return () => {}
    },
    dispose() {},
  }
  return new WorkerSession(port)
}

describe('default flagship runtime factory', () => {
  it('returns a fresh idle runtime bound to the repository flagship plan', () => {
    const expected = buildDefaultFlagshipRun()
    const runtime = createFlagshipExperimentRuntime(createIdleSession())

    expect(runtime.state.worker.phase).toBe('idle')
    expect(runtime.state.controls.identity).toEqual(expected.plan.identity)
    expect(runtime.state.snapshot).toBeNull()

    runtime.dispose()
    expect(runtime.state.worker.phase).toBe('disposed')
  })

  it('uses fresh command-id state per runtime lifetime', () => {
    const first = createFlagshipExperimentRuntime(createIdleSession())
    const second = createFlagshipExperimentRuntime(createIdleSession())

    expect(first).not.toBe(second)
    expect(first.state.controls.identity).toEqual(second.state.controls.identity)

    first.dispose()
    second.dispose()
  })
})
