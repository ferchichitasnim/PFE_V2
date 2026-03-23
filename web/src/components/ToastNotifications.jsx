"use client";

import { Toaster } from "react-hot-toast";

export default function ToastNotifications() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "var(--pbi-surface)",
          color: "var(--pbi-text)",
          border: "1px solid var(--pbi-border)",
          borderRadius: 10,
        },
      }}
    />
  );
}
