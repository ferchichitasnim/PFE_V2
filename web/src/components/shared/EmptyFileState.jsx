"use client";

import { ArrowUp, FileSpreadsheet } from "lucide-react";
import { motion } from "framer-motion";

export default function EmptyFileState({ message }) {
  return (
    <div className="card" style={{ padding: 36, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
      <FileSpreadsheet size={56} color="var(--pbi-muted)" style={{ margin: "0 auto 16px" }} />
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No file loaded</div>
      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        {message || "Upload a .pbix file using the bar above."}
      </p>
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        style={{ marginTop: 20, display: "flex", justifyContent: "center", color: "var(--pbi-muted)" }}
      >
        <ArrowUp size={28} />
      </motion.div>
    </div>
  );
}
