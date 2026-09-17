// Re-export from features/map/services — the canonical location.
// Known architectural debt: core/services/territorio.ts imports DraftMarksService
// from this re-export, creating a core→feature dependency.
export { DraftMarksService } from '../../features/map/services/map-draft';
export type { MapDraft, DraftPoint, DraftTerritorioParcial } from '../../features/map/services/map-draft';
