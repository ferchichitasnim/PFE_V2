import { MetricPlan, ParsedIntent, ReducedDaxContext, ReducedTable } from "./types";

function quoteRef(table: string, column: string) {
  return `'${table}'[${column}]`;
}

function pickTableForHr(ctx: ReducedDaxContext): ReducedTable | null {
  const preferred = ctx.tables.find((t) => /employee|worker|staff/i.test(t.name) && !t.isDateTable);
  if (preferred) return preferred;
  const fallback = ctx.tables.find((t) => !t.isDateTable);
  return fallback || null;
}

function findColumn(table: ReducedTable, matcher: RegExp, list: string[]) {
  const inTable = list.find((c) => matcher.test(c));
  if (inTable) return inTable;
  return table.columns.find((c) => matcher.test(c)) || "";
}

export function planMetric(intent: ParsedIntent, ctx: ReducedDaxContext): MetricPlan {
  if (intent.kind !== "ratio" || intent.domain !== "hr" || !/hiring\s*rate|hire\s*rate/i.test(intent.metric)) {
    return {
      status: "insufficient_context",
      reason: "Only HR hiring-rate metric planning is currently supported for strict template mode.",
    };
  }

  const table = pickTableForHr(ctx);
  if (!table) return { status: "insufficient_context", reason: "No non-date table available for HR metric denominator." };

  const newHiresCol = findColumn(table, /(new\s*hire|new_hire|hires?)/i, table.numericColumns);
  const activesCol = findColumn(table, /(active|actives|headcount|employee\s*count)/i, table.numericColumns);
  if (newHiresCol && activesCol) {
    return {
      status: "ready",
      strategy: "numeric_ratio",
      measureName: "Hiring Rate",
      numeratorRef: quoteRef(table.name, newHiresCol),
      denominatorRef: quoteRef(table.name, activesCol),
      domain: "hr",
      notes: ["Using direct ratio with numeric columns New Hires / Actives."],
    };
  }

  const boolCol = findColumn(table, /(is\s*new\s*hire|isnewhire|new_hire|newhire)/i, table.booleanColumns);
  if (boolCol) {
    return {
      status: "ready",
      strategy: "boolean_ratio",
      measureName: "Hiring Rate",
      booleanRef: quoteRef(table.name, boolCol),
      denominatorTable: `'${table.name}'`,
      domain: "hr",
      notes: ["Using boolean new-hire flag with filtered count ratio."],
    };
  }

  return {
    status: "insufficient_context",
    reason: "Cannot find required fields for hiring rate (New Hires + Actives, or isNewHire).",
  };
}
