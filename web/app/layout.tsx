import type { ReactNode } from "react";
import "../src/styles/globals.css";

export const metadata = {
  title: "Power BI Assistant",
  description: "Storytelling and DAX assistant for Power BI models",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
