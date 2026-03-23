export default function Header() {
  return (
    <header
      className="card"
      style={{
        marginBottom: 14,
        padding: 16,
        background: "linear-gradient(90deg, var(--pbi-dark), var(--pbi-surface))",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="9" width="4" height="12" fill="#F2C811" />
          <rect x="10" y="5" width="4" height="16" fill="#00B294" />
          <rect x="17" y="2" width="4" height="19" fill="#8764B8" />
        </svg>
        <div>
          <div style={{ fontWeight: 800 }}>PBIX Storyteller</div>
          <div className="muted" style={{ fontSize: 12 }}>
            AI-Powered Data Narratives
          </div>
        </div>
      </div>
      <span
        style={{
          border: "1px solid var(--pbi-border)",
          borderRadius: 999,
          padding: "6px 10px",
          fontSize: 12,
          color: "var(--pbi-muted)",
        }}
      >
        v1
      </span>
    </header>
  );
}
