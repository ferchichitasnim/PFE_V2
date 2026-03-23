import { motion } from "framer-motion";

export default function SectionCard({ title, icon, color, children }) {
  return (
    <motion.div
      className="card"
      style={{ borderLeft: `4px solid ${color}`, padding: 14 }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span>{icon}</span>
        <strong>{title}</strong>
      </div>
      <div>{children}</div>
    </motion.div>
  );
}
