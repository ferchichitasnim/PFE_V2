import { MetricPlan } from "./types";

export function renderDaxFromPlan(plan: MetricPlan): string {
  if (plan.status !== "ready") return "";

  if (plan.strategy === "numeric_ratio") {
    return `${plan.measureName} =
DIVIDE(
    SUM(${plan.numeratorRef}),
    SUM(${plan.denominatorRef}),
    0
)`;
  }

  return `${plan.measureName} =
DIVIDE(
    COUNTROWS(FILTER(${plan.denominatorTable}, ${plan.booleanRef} = TRUE())),
    COUNTROWS(${plan.denominatorTable}),
    0
)`;
}
