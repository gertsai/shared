---
"@gertsai/entity-react": patch
---

Keep `useEntity` snapshots stable between mutations so React 18 does not enter an external-store re-render loop, and track entity changes correctly.
