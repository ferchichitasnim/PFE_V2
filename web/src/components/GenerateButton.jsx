"use client";

export default function GenerateButton({ disabled, loading, onClick, onStop }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button className="button" disabled={disabled || loading} onClick={onClick}>
        {loading ? "Generating story..." : "Generate Story"}
      </button>
      {loading && (
        <button
          className="button"
          style={{ background: "var(--pbi-surface-alt)", color: "var(--pbi-text)" }}
          onClick={onStop}
        >
          Stop
        </button>
      )}
    </div>
  );
}
