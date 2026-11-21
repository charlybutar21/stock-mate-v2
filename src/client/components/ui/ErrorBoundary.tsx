import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './primitives';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Intentionally avoid logging sensitive state
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface p-6">
          <div className="max-w-md rounded-xl border border-border bg-panel p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-negative-50 text-negative-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h1 className="text-base font-semibold text-ink">Unexpected Interface Error</h1>
            <p className="mt-1 text-sm text-muted">
              The application encountered a rendering error. Your data is safe.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
