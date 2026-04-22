"use client";

import { BookOpen, FileText, Sparkles, Zap } from "lucide-react";

function UseCaseCard({ title, description, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        textAlign: "left",
        padding: 20,
        cursor: "pointer",
        display: "grid",
        gap: 12,
        background: "var(--pbi-surface)",
        transition: "transform 140ms ease, box-shadow 140ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 14px 26px rgba(17, 24, 39, 0.07)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(17, 24, 39, 0.04)";
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "#eef3ff",
          color: "var(--pbi-primary)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon size={18} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      <div className="muted" style={{ lineHeight: 1.55 }}>
        {description}
      </div>
    </button>
  );
}

export default function HomePage({ onNavigate }) {
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Sparkles size={18} color="var(--pbi-primary)" />
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pbi-primary)" }}>Welcome</div>
        </div>
        <h1 style={{ margin: "0 0 10px", fontSize: 30 }}>Power BI Assistant</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
          Choose a use case to start. Upload a `.pbix` file in the top bar, then generate insights with storytelling or
          build DAX measures from plain language.
        </p>
      </section>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <UseCaseCard
          title="Storytelling"
          description="Generate a clean, business-ready narrative with key insights, risks, and recommended actions."
          icon={BookOpen}
          onClick={() => onNavigate("storytelling")}
        />
        <UseCaseCard
          title="DAX Generator"
          description="Describe your metric in plain language and get DAX code with explanation and improvement tips."
          icon={Zap}
          onClick={() => onNavigate("dax")}
        />
        <UseCaseCard
          title="Documentation"
          description="Browse extracted model documentation including data sources, tables, relationships, measures, and parameters."
          icon={FileText}
          onClick={() => onNavigate("documentation")}
        />
      </section>
    </div>
  );
}
