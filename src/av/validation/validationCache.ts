/**
 * validationCache.ts
 * Recalculates from current design signature only. Never treats a
 * previous report as authoritative after undo/geometry change.
 */

import type { AppState } from '../../app/AppState';
import { loadDefaultCatalog } from '../../catalog/loadCatalog';
import { runDesignValidation } from './DesignValidationEngine';
import { compareSummaries, designSignature, type ValidationDelta, type ValidationReport, type ValidationSummary } from './ValidationTypes';

const catalog = loadDefaultCatalog();

let lastSig = '';
let lastReport: ValidationReport | null = null;
let lastSummary: ValidationSummary | null = null;
let lastDelta: ValidationDelta | null = null;

export function validationReportFor(state: AppState): ValidationReport {
  const sig = designSignature({
    room: state.room,
    seats: state.seats,
    tables: state.tables,
    equipment: state.equipment,
    connections: state.connections,
    routes: state.routes
  });
  if (sig === lastSig && lastReport) return lastReport;
  const prev = lastSummary;
  const report = runDesignValidation({
    room: state.room,
    seats: state.seats,
    tables: state.tables,
    equipment: state.equipment,
    connections: state.connections,
    routes: state.routes,
    catalog
  });
  lastDelta = compareSummaries(prev, report.summary);
  lastSig = sig;
  lastReport = report;
  lastSummary = report.summary;
  return report;
}

export function lastValidationDelta(): ValidationDelta | null {
  return lastDelta;
}

export function resetValidationCache(): void {
  lastSig = '';
  lastReport = null;
  lastSummary = null;
}

/** Test helper: run without AppState UI side effects. */
export function validationReportFromStateLike(state: {
  room: AppState['room'];
  seats: AppState['seats'];
  tables: AppState['tables'];
  equipment: AppState['equipment'];
  connections?: AppState['connections'];
  routes?: AppState['routes'];
}): ValidationReport {
  return runDesignValidation({
    room: state.room,
    seats: state.seats,
    tables: state.tables,
    equipment: state.equipment,
    connections: state.connections ?? [],
    routes: state.routes ?? [],
    catalog
  });
}
