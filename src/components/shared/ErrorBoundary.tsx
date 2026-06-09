'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 bg-[#0A0A0A]">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-white text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm text-center max-w-md mb-6">
            An unexpected error occurred. This has been logged for investigation.
          </p>
          {this.state.error && (
            <details className="mb-6 max-w-lg w-full">
              <summary className="text-gray-600 text-xs cursor-pointer hover:text-gray-400">Error details</summary>
              <pre className="mt-2 p-3 bg-[#1A1A1A] rounded-lg border border-white/5 text-red-400 text-xs overflow-x-auto whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <button onClick={this.handleReset} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all">
            <RotateCcw className="w-4 h-4" /> Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SectionErrorBoundary({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <ErrorBoundary onError={(error, errorInfo) => console.error(`[SectionErrorBoundary:${name}]`, error, errorInfo)}>
      {children}
    </ErrorBoundary>
  );
}
