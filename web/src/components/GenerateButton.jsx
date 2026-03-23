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
          style={{ background: "#2a2a2a", color: "var(--pbi-text)" }}
          onClick={onStop}
        >
          Stop
        </button>
      )}
    </div>
  );
}
