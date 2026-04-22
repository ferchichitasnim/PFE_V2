"use client";

import { motion } from "framer-motion";
import { BarChart3, BookOpen, ChevronLeft, ChevronRight, FileText, Zap } from "lucide-react";

export const NAV_ITEMS = [
  { id: "storytelling", label: "Storytelling", icon: BookOpen },
  { id: "dax", label: "DAX Generator", icon: Zap },
  { id: "documentation", label: "Documentation", icon: FileText },
];

export function MobileBottomNav({ activeTab, onTabChange }) {
  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 35,
        display: "flex",
        background: "var(--pbi-surface)",
        borderTop: "1px solid var(--pbi-border)",
        padding: "8px 12px calc(8px + env(safe-area-inset-bottom))",
        gap: 8,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "8px 6px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              background: active ? "rgba(242, 200, 17, 0.12)" : "transparent",
              color: active ? "var(--pbi-yellow)" : "var(--pbi-muted)",
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              transition: "background 150ms ease",
            }}
          >
            <Icon size={22} />
            <span style={{ lineHeight: 1.1, textAlign: "center" }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggleCollapse }) {
  const width = collapsed ? 64 : 240;

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.18, ease: "easeInOut" }}
      style={{
        flexShrink: 0,
        background: "var(--pbi-surface)",
        borderRight: "1px solid var(--pbi-border)",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: collapsed ? "14px 10px" : "16px 14px",
          borderBottom: "1px solid var(--pbi-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <BarChart3 size={22} color="var(--pbi-yellow)" />
        {!collapsed && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Power BI Assistant</div>
            <div className="muted" style={{ fontSize: 11 }}>
              Storytelling and DAX
            </div>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: "12px 8px", display: "grid", gap: 6, alignContent: "start" }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: collapsed ? 0 : 10,
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "12px 8px" : "12px 12px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                background: active ? "rgba(242, 200, 17, 0.12)" : "transparent",
                color: "var(--pbi-text)",
                borderLeft: active ? "3px solid var(--pbi-yellow)" : "3px solid transparent",
                transition: "background 150ms ease, border-color 150ms ease",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--pbi-border)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon size={20} color={active ? "var(--pbi-yellow)" : "var(--pbi-muted)"} />
              {!collapsed && <span style={{ fontWeight: active ? 700 : 500 }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--pbi-border)" }}>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapse}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 8px",
            borderRadius: 10,
            border: "1px solid var(--pbi-border)",
            background: "#101a33",
            color: "var(--pbi-text)",
            cursor: "pointer",
            transition: "background 150ms ease",
          }}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
    </motion.aside>
  );
}
