export default function Header({ title, subtitle, icon }) {
  return (
    <header
      className="card"
      style={{
        marginBottom: 18,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {icon}
        <div>
          <div style={{ fontWeight: 800, fontSize: 24 }}>{title}</div>
        </div>
      </div>
      {subtitle && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.55, maxWidth: 760 }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}
