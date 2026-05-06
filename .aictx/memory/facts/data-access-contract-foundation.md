# Data-access contract foundation exists

T007 added the host-neutral data-access service foundation under `src/data-access/`. The default service exposes `load`, `search`, `inspect`, `diff`, and `applyPatch`, accepts `DataAccessProjectTarget` as either `cwd` or `project-root`, resolves that target to one project root and `.aictx` boundary, and returns current `AppResult` envelopes. For this foundation slice, the service delegates to existing app operations; T008/T009 are expected to move read/write operation bodies behind this contract.

Focused unit coverage lives in `test/unit/data-access/service.test.ts` for project targeting, nested cwd boundary resolution, and envelope preservation.
