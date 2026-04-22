import { MetricPlan } from "./types";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function repairDaxFormula(dax: string, plan: MetricPlan): string {
  let out = (dax || "").trim();
  out = out.replace(/`+/g, "");
  out = out.replace(/\r/g, "");
  out = out.replace(/\bSUMX\s*\(\s*([^,()]+)\s*,\s*1\s*\)/gi, "COUNTROWS($1)");
  out = out.replace(/\bCOUNTX\s*\(\s*([^,()]+)\s*,\s*1\s*\)/gi, "COUNTROWS($1)");

  const assign = out.match(/^([^\n=]+?)\s*=\s*([\s\S]*)$/);
  if (assign) {
    const name = assign[1].trim();
    let expr = assign[2].trim();
    expr = expr.replace(new RegExp(`^${escapeRegex(name)}\\s*=\\s*`, "i"), "");
    out = `${name} =\n${expr}`;
  }

  if (plan.status === "ready" && plan.strategy === "boolean_ratio" && plan.booleanRef && plan.denominatorTable) {
    out = out.replace(
      /\bCOUNTX\s*\([^,]+,\s*'[^']+'\[[^\]]+\]\s*\)/gi,
      `COUNTROWS(FILTER(${plan.denominatorTable}, ${plan.booleanRef} = TRUE()))`
    );
    out = out.replace(/\bCOUNTROWS\s*\(\s*'[^']*(date|calendar|time)[^']*'\s*\)/gi, `COUNTROWS(${plan.denominatorTable})`);
  }

  return out.trim();
}
