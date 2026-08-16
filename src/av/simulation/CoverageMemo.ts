/**
 * CoverageMemo.ts
 * Signature-keyed memo for coverage grids + rasterized heatmap images.
 * One instance per analysis layer so display, microphone, and speaker caches do not collide.
 */

import { rasterizeCoverageGrid, type HeatmapCell, type HeatmapImage } from '../HeatmapEngine';

export interface MemoizableGrid {
  cols: number;
  rows: number;
  cells: HeatmapCell[];
}

export function createCoverageMemo<TGrid extends MemoizableGrid>(): {
  get: (key: string, compute: () => TGrid) => { grid: TGrid; image: HeatmapImage };
} {
  let lastKey = '';
  let lastGrid: TGrid | null = null;
  let lastImage: HeatmapImage | null = null;

  return {
    get(key: string, compute: () => TGrid): { grid: TGrid; image: HeatmapImage } {
      if (key !== lastKey || !lastGrid) {
        lastKey = key;
        lastGrid = compute();
        lastImage = rasterizeCoverageGrid(lastGrid.cells, lastGrid.cols, lastGrid.rows);
      }
      return {
        grid: lastGrid,
        image: lastImage ?? { width: lastGrid.cols, height: lastGrid.rows, dataUrl: null }
      };
    }
  };
}
