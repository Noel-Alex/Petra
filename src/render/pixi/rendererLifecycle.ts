export interface DestroyableRenderer {
  destroy(): void;
}

export interface RendererInitializationCallbacks<T extends DestroyableRenderer> {
  readonly onReady: (renderer: T) => void;
  readonly onError: (error: Error) => void;
}

export interface RendererInitializationHandle {
  dispose(): void;
}

/**
 * Owns the async lifecycle race between renderer creation and React unmount/retry.
 *
 * A late renderer is destroyed instead of being attached after disposal. Rejections
 * are consumed and surfaced through onError so Pixi/WebGL startup failures do not
 * become unhandled promise rejections.
 */
export function beginRendererInitialization<T extends DestroyableRenderer>(
  create: () => Promise<T>,
  callbacks: RendererInitializationCallbacks<T>,
): RendererInitializationHandle {
  let disposed = false;
  let instance: T | null = null;

  void (async () => {
    try {
      const renderer = await create();

      if (disposed) {
        renderer.destroy();
        return;
      }

      instance = renderer;
      try {
        callbacks.onReady(renderer);
      } catch (reason: unknown) {
        instance = null;
        renderer.destroy();
        if (!disposed) callbacks.onError(toRendererInitializationError(reason));
      }
    } catch (reason: unknown) {
      if (!disposed) callbacks.onError(toRendererInitializationError(reason));
    }
  })();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      instance?.destroy();
      instance = null;
    },
  };
}

export function toRendererInitializationError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string" && reason.trim().length > 0) {
    return new Error(reason);
  }
  return new Error("The Petri dish renderer could not start.");
}
