---
applyTo: "**/*.Codeunit.al, **/*.Query.al"
description: "Performance optimization guidelines and best practices for AL development"
---

# AL Performance — Micro Rules

Hard safety-net rules. Patterns, AL0896 triage and examples live in `skill-performance`.

1. **`SetRange`/`SetFilter` before `Find`/`FindSet`/`FindFirst`**. Filter early, do not process and filter later.
2. **`SetLoadFields` before `Get`/`Find`** when only some columns are used. Order matters: `SetLoadFields` → `SetRange` → `Find`.
3. **`CalcSums` instead of accumulation loops**. If you need a total, do not iterate and sum — use the platform aggregation.
4. **No database calls inside loops** (`Get`, `FindFirst`, `CalcFields` per record). Preload into a `Dictionary`/`temporary` or use `SetAutoCalcFields` before the loop.
5. **One write per modified record**: calculate all changes in memory and emit a single `Modify(true)`.
