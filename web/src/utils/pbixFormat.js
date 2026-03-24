export function formatDaxContextSnippet(pc) {
  if (!pc?.tables?.length) return "";
  const tableLine = `Tables: ${pc.tables.join(", ")}`;
  const colLines = Object.entries(pc.columns || {}).map(([t, cols]) => {
    const list = (cols || []).map((c) => `${t}[${c}]`).join(", ");
    return `${t}: ${list}`;
  });
  let out = `${tableLine}\n\nColumns:\n${colLines.join("\n")}`;
  if (pc.measures?.length) {
    out += `\n\nMeasures: ${pc.measures.join(", ")}`;
  }
  if (pc.relationships?.length) {
    out += `\n\nRelationships:\n${pc.relationships.map((r) => `  ${r}`).join("\n")}`;
  }
  return out;
}
