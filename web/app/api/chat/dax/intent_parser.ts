// intent_parser.ts — unchanged, still useful for domain hints in validation
import { ParsedIntent } from "./types";

export function parseDaxIntent(prompt: string): ParsedIntent {
  const q = (prompt || "").trim().toLowerCase();
  if (!q) return { kind: "unknown", metric: "unknown", domain: "generic" };

  const domain: ParsedIntent["domain"] = /\b(hire|hiring|employee|attrition|headcount|hr)\b/.test(q)
    ? "hr"
    : /\b(revenue|sales|profit|margin|finance)\b/.test(q)
      ? "finance"
      : "generic";

  if (/\b(yoy|year over year|year-over-year)\b/.test(q)) return { kind: "yoy", metric: q, domain };
  if (/\b(ytd|year to date)\b/.test(q)) return { kind: "ytd", metric: q, domain };
  if (/\b(rolling|moving average)\b/.test(q)) return { kind: "rolling", metric: q, domain };
  if (/\b(rate|ratio|percent|percentage)\b/.test(q)) return { kind: "ratio", metric: q, domain };
  if (/\b(count|number of|total)\b/.test(q)) return { kind: "count", metric: q, domain };
  return { kind: "unknown", metric: q, domain };
}