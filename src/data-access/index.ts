export {
  createDataAccessService,
  dataAccessService,
  type DataAccessApplyPatchInput,
  type DataAccessDiffInput,
  type DataAccessInspectInput,
  type DataAccessLoadInput,
  type DataAccessProjectTarget,
  type DataAccessSearchInput,
  type DataAccessService
} from "./service.js";

export type {
  AppResult,
  DiffMemoryData,
  InspectMemoryData,
  MemoryRelationSummary
} from "../app/operations.js";
