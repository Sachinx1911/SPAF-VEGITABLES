import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Last line of defence: without this, one render error blanks the whole screen
 * and the operator loses the day's work in progress. Recovery keeps the stored
 * data — only the crashed view is rebuilt.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept on the console so a support call can read the real cause.
    console.error('SPAF: render failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4">
        <div className="w-full max-w-md rounded-card border border-line bg-white p-6 text-center shadow-card">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-500">
            <TriangleAlert size={24} />
          </span>
          <h1 className="mt-4 text-[18px] font-bold text-ink">Something went wrong</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            This screen could not be displayed. Your saved data is safe — reload to continue where you left off.
          </p>
          <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-left font-mono text-[11.5px] break-words text-subtle">
            {error.message}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-canvas"
            >
              Try again
            </button>
            <button
              onClick={() => { window.location.hash = '#/'; window.location.reload(); }}
              className="rounded-lg bg-brand-800 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
