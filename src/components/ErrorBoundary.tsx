import * as React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Last line of defense: a crash anywhere in the tree shows a friendly
// restart screen instead of a dead white page. User data lives in
// IndexedDB/localStorage, so a reload always recovers cleanly.
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Audibook crashed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 24,
          textAlign: "center",
          background: "#F0F2F5",
          fontFamily: "ui-rounded, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ fontSize: 56 }}>🦉</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A" }}>Oops — Audi tripped over a branch!</h1>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", maxWidth: 280, lineHeight: 1.5 }}>
          Something went wrong, but your books, downloads, and progress are all safe. A quick restart fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: "14px 28px",
            background: "#58CC02",
            color: "#fff",
            border: "none",
            borderBottom: "4px solid #46A302",
            borderRadius: 16,
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Restart Audibook
        </button>
      </div>
    );
  }
}
