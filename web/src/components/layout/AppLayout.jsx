"use client";

import ToastNotifications from "../ToastNotifications";
import GlobalFileBar from "./GlobalFileBar";
import BrandLogo from "./BrandLogo";

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "storytelling", label: "Storytelling" },
  { id: "dax", label: "DAX Generator" },
  { id: "documentation", label: "Documentation" },
];

export default function AppLayout({ children, activeTab, onTabChange }) {
  return (
    <div className="app-shell">
      <ToastNotifications />
      <header className="top-nav">
        <div className="top-nav-inner">
          <BrandLogo />
          <nav aria-label="Primary" className="top-nav-links">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`top-nav-link ${activeTab === item.id ? "active" : ""}`}
                onClick={() => onTabChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <GlobalFileBar />
      <main className="page-shell">{children}</main>
    </div>
  );
}
