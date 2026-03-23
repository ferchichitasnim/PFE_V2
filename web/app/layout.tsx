import type { ReactNode } from "react";
import "../src/styles/globals.css";

export const metadata = {
  title: "PBIX Storyteller",
  description: "AI-Powered Data Narratives",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
