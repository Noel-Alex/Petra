import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  normalizeRuntimeFailure,
  type RuntimeFailure,
} from "./runtimeRecovery";

export interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onReload?: () => void;
  readonly onError?: (failure: RuntimeFailure, info: ErrorInfo) => void;
}

interface AppErrorBoundaryState {
  readonly failure: RuntimeFailure | null;
}

/**
 * Last-resort presentation containment.
 *
 * Worker/runtime failures belong to the typed runtime path and should never
 * arrive here. This boundary exists so an unexpected React render/lifecycle
 * failure cannot strand the expo shell in a blank or fake-ready state.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      failure: normalizeRuntimeFailure(error, "presentation", "presentation"),
    };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo): void {
    const failure = this.state.failure;
    if (failure !== null) {
      this.props.onError?.(failure, info);
    }
  }

  render(): ReactNode {
    const failure = this.state.failure;
    if (failure === null) return this.props.children;

    return (
      <main className="petra-app petra-fatal-recovery">
        <section
          className="petra-recovery-card"
          aria-labelledby="petra-fatal-recovery-title"
        >
          <p className="petra-kicker">Recovery</p>
          <h1 id="petra-fatal-recovery-title">{failure.title}</h1>
          <p role="alert">{failure.userMessage}</p>
          <button
            type="button"
            onClick={() => {
              if (this.props.onReload !== undefined) {
                this.props.onReload();
                return;
              }
              globalThis.location.reload();
            }}
          >
            Reload Petra
          </button>
          <p className="panel-note">
            Reloading is an explicit recovery action and may end an unsaved run.
            Petra will not silently substitute a different experiment from this
            error screen.
          </p>
        </section>
      </main>
    );
  }
}
