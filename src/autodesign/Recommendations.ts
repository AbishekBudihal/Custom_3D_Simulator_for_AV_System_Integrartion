import type { EquipmentCatalog } from '../catalog/EquipmentCatalog';
import {
  analyzeAllSeatsAgainstDisplay,
  getActiveDisplay,
  projectObstacles,
  summarizeDesignHealth
} from '../av/DesignAnalysis';
import type { ProjectDesignContext } from './DesignProposal';

export interface LiveRecommendation {
  id: string;
  title: string;
  message: string;
  actions?: Array<{ id: string; label: string }>;
}

/**
 * Advice only — never mutates the design. Uses existing viewing analysis.
 */
export function recommendationsAfterManual(ctx: ProjectDesignContext, catalog: EquipmentCatalog): LiveRecommendation[] {
  const out: LiveRecommendation[] = [];
  const display = getActiveDisplay(ctx.equipment, catalog);
  if (!display || !ctx.seats.length) return out;
  const obstacles = projectObstacles(ctx.room, ctx.tables);
  const health = summarizeDesignHealth(ctx.seats, display, obstacles);
  const analyses = analyzeAllSeatsAgainstDisplay(ctx.seats, display, obstacles);
  const worst = analyses.find((a) => a.seatId === health.worstSeatId) ?? analyses[0];
  if (health.failCount > 0 || health.warningCount > 0) {
    out.push({
      id: 'viewing-margin',
      title: 'RECOMMENDATION',
      message:
        health.failCount > 0
          ? `Display is outside the viewing criterion for ${health.failCount} seat(s). Worst seat ${worst?.seatId ?? ''} at ${worst?.distance.value.toFixed(1) ?? '?'} m.`
          : `Display is below preferred viewing margin (${health.warningCount} seat warning(s)).`,
      actions: [
        { id: 'open-autodesign', label: 'Review alternative' },
        { id: 'keep', label: 'Keep current' }
      ]
    });
  }
  const moved = ctx.equipment.filter((e) => e.origin === 'manual' || e.placementMode === 'manual');
  if (moved.length) {
    out.push({
      id: 'manual-override',
      title: 'MANUAL OVERRIDE',
      message: `${moved.length} object(s) marked MANUAL. Analysis uses the real geometry. Auto Design will not move them unless you choose Replace.`
    });
  }
  return out;
}

export const LEARN_TOPICS: Record<string, { q: string; a: string }> = {
  displaySize: {
    q: 'Why does display size matter?',
    a: 'Viewing distance affects whether content can be comfortably resolved from the seating positions. SIMSTAGE uses the existing viewing-distance engine and catalog screen size — not a marketing inch label alone.'
  },
  displayCount: {
    q: 'Why are we asking about display count?',
    a: 'Dual displays may improve visibility when different content needs to be shown simultaneously. The catalog must still provide a valid signal path for each display.'
  },
  mics: {
    q: 'Why microphone type?',
    a: 'Table and ceiling products use different catalog pickup radii. Coverage is the existing disc/sector engine, not a seat-count recipe.'
  },
  camera: {
    q: 'Why camera FOV?',
    a: 'Horizontal field of view from the catalog determines which seats fall inside the geometric frustum. Missing HFOV is DATA INCOMPLETE — 60°/90° is not assumed.'
  },
  speakers: {
    q: 'Why speaker coverage?',
    a: 'Estimated SPL and catalog dispersion decide whether seats sit in the modeled coverage region. This is not a room-acoustic simulation.'
  }
};
