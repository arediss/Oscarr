import React, { Component as ReactComponent } from 'react';

interface Props {
  pluginId: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PluginErrorBoundary extends ReactComponent<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.warn('[Plugin] Frontend crashed:', this.props.pluginId, error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-6 text-center">
          <p className="text-ndp-error text-sm font-medium">Plugin error</p>
          <p className="text-ndp-text-dim text-xs mt-1">
            The plugin "{this.props.pluginId}" encountered an error.
          </p>
          {this.state.error && (
            <p className="text-ndp-text-dim text-xs mt-2 font-mono opacity-60">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 text-xs text-ndp-accent hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
