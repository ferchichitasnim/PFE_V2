"use client";

import { Copy, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import SectionCard from "./SectionCard";

function extractSection(md, heading) {
  const pattern = new RegExp(`##\\s*${heading}\\s*([\\s\\S]*?)(?=##\\s*|$)`, "i");
  const match = md.match(pattern);
  return match ? match[1].trim() : "";
}

export default function StoryOutput({ content, loading }) {
  const sections = {
    overview: extractSection(content, "Overview"),
    insights: extractSection(content, "Key Insights"),
    risks: extractSection(content, "Risks or Data Quality Concerns"),
    actions: extractSection(content, "Recommended Actions"),
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(content || "");
    toast.success("Story copied");
  };

  const download = (ext) => {
    const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pbix-story.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Story Output</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" onClick={copyText} disabled={!content}>
            <Copy size={14} />
          </button>
          <button className="button" onClick={() => download("md")} disabled={!content}>
            <Download size={14} /> .md
          </button>
          <button className="button" onClick={() => download("txt")} disabled={!content}>
            <Download size={14} /> .txt
          </button>
        </div>
      </div>

      {loading && !content && (
        <div className="card" style={{ padding: 12 }}>
          <div className="muted">Initializing story...</div>
          <div style={{ height: 6, marginTop: 8, background: "#101a33", borderRadius: 999 }} />
        </div>
      )}

      {content && (
        <div className="section-grid">
          <SectionCard title="Overview" icon="🧭" color="var(--pbi-purple)">
            <ReactMarkdown>{sections.overview || "No content."}</ReactMarkdown>
          </SectionCard>
          <SectionCard title="Key Insights" icon="💡" color="var(--pbi-yellow)">
            <ReactMarkdown>{sections.insights || "No content."}</ReactMarkdown>
          </SectionCard>
          <SectionCard title="Risks" icon="⚠️" color="#E74C3C">
            <ReactMarkdown>{sections.risks || "No content."}</ReactMarkdown>
          </SectionCard>
          <SectionCard title="Recommended Actions" icon="✅" color="var(--pbi-success)">
            <ReactMarkdown>{sections.actions || "No content."}</ReactMarkdown>
          </SectionCard>
        </div>
      )}

      {loading && (
        <div style={{ marginTop: 10, fontSize: 13 }} className="muted">
          Streaming... <span style={{ animation: "blink 1s infinite" }}>|</span>
        </div>
      )}
    </div>
  );
}
