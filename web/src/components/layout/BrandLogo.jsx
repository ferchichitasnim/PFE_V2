"use client";

export default function BrandLogo() {
  return (
    <div className="brand-logo" aria-label="Power BI Assistant">
      <span className="brand-logo-mark" aria-hidden="true">
        <svg className="brand-logo-svg" viewBox="0 0 24 24" fill="none" role="img">
          <rect x="2.5" y="9.5" width="4" height="11" rx="1.4" fill="#ffffff" />
          <rect x="10" y="5.25" width="4" height="15.25" rx="1.4" fill="#ffffff" opacity="0.9" />
          <rect x="17.5" y="2.5" width="4" height="18" rx="1.4" fill="#ffffff" opacity="0.8" />
        </svg>
      </span>
      <span className="brand-logo-copy">
        <span className="brand-logo-title">Power BI Assistant</span>
        <span className="muted brand-logo-subtitle">
          Storytelling and DAX
        </span>
      </span>
    </div>
  );
}
