"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ArrowRight, BookOpen, Code, Copy, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";

function SkeletonBlock() {
  return (
    <div className="dax-skeleton-wrap" style={{ display: "grid", gap: 8 }}>
      <div className="dax-skeleton-line" style={{ width: "70%" }} />
      <div className="dax-skeleton-line" style={{ width: "90%" }} />
      <div className="dax-skeleton-line" style={{ width: "55%" }} />
    </div>
  );
}

function copyRaw(text) {
  navigator.clipboard.writeText(text || "");
  toast.success("Copied!");
}

function codeBlock({ inline, children, ...props }) {
  if (inline === true) {
    return (
      <code
        {...props}
        style={{
          background: "#eef1fb",
          color: "var(--pbi-text)",
          padding: "2px 6px",
          borderRadius: 6,
          fontSize: "0.92em",
          fontFamily: "var(--pbi-mono)",
        }}
      >
        {children}
      </code>
    );
  }
  return (
    <pre
      style={{
        background: "#f4f7fd",
        padding: 12,
        borderRadius: 8,
        overflow: "auto",
        fontFamily: "var(--pbi-mono)",
        fontSize: 13,
      }}
      {...props}
    >
      <code>{children}</code>
    </pre>
  );
}

function mdExplanationComponents() {
  return { code: codeBlock };
}

function mdSuggestionsComponents() {
  return {
    code: codeBlock,
    li({ children }) {
      return (
        <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
          <ArrowRight size={16} color="var(--pbi-purple)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>{children}</span>
        </li>
      );
    },
  };
}

export default function DAXOutputCard({ daxCode, explanation, suggestions, isLoading }) {
  const showSk1 = isLoading && !String(daxCode || "").trim();
  const showSk2 = isLoading && !String(explanation || "").trim();
  const showSk3 = isLoading && !String(suggestions || "").trim();

  return (
    <div style={{ display: "grid", gap: 16, minHeight: 0 }}>
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          borderLeft: "3px solid var(--pbi-primary)",
          padding: 14,
          background: "var(--pbi-surface)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Code size={18} color="var(--pbi-primary)" />
            <strong style={{ fontSize: 15 }}>Generated DAX</strong>
          </div>
          <button
            type="button"
            className="button"
            style={{ padding: "6px 10px", fontSize: 12, height: "auto", background: "var(--pbi-surface-alt)", color: "var(--pbi-text)" }}
            disabled={!daxCode?.trim()}
            onClick={() => copyRaw(daxCode)}
          >
            <Copy size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Copy
          </button>
        </div>
        {showSk1 ? (
          <SkeletonBlock />
        ) : (
          <SyntaxHighlighter
            language="sql"
            style={oneLight}
            showLineNumbers
            customStyle={{
              margin: 0,
              borderRadius: 10,
              background: "#f4f7fd",
              fontSize: 13,
              fontFamily: "var(--pbi-mono)",
              border: "1px solid var(--pbi-border)",
            }}
            codeTagProps={{ style: { fontFamily: "var(--pbi-mono)" } }}
          >
            {daxCode || " "}
          </SyntaxHighlighter>
        )}
        <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          Insert into Power BI: Modeling → New measure → paste the formula.
        </div>
      </motion.div>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          borderLeft: "3px solid var(--pbi-success)",
          padding: 14,
          background: "var(--pbi-surface-alt)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <BookOpen size={18} color="var(--pbi-success)" />
          <strong style={{ fontSize: 15 }}>How it works</strong>
        </div>
        {showSk2 ? (
          <SkeletonBlock />
        ) : (
          <div className="dax-md" style={{ fontSize: 14, lineHeight: 1.55 }}>
            <ReactMarkdown components={mdExplanationComponents()}>{explanation || "_Waiting for explanation…_"}</ReactMarkdown>
          </div>
        )}
      </motion.div>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          borderLeft: "3px solid var(--pbi-purple)",
          padding: 14,
          background: "var(--pbi-surface-alt)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Lightbulb size={18} color="var(--pbi-purple)" />
          <strong style={{ fontSize: 15 }}>Suggestions &amp; Variants</strong>
        </div>
        {showSk3 ? (
          <SkeletonBlock />
        ) : (
          <div className="dax-md" style={{ fontSize: 14, lineHeight: 1.55 }}>
            <ReactMarkdown components={mdSuggestionsComponents()}>{suggestions || "_Waiting for suggestions…_"}</ReactMarkdown>
          </div>
        )}
      </motion.div>
    </div>
  );
}
