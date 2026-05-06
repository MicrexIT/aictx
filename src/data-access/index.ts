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
  MemoryRelationSummary,
  SaveMemoryData
} from "../app/operations.js";
