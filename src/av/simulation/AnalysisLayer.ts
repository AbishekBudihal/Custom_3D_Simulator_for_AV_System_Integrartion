/**
 * AnalysisLayer.ts
 * Maps validation findings to simulation overlay layers.
 * Domain engines stay separate; this only decides which viz to enable on View issue.
 */

export type AnalysisLayer = 'display' | 'microphone' | 'audio' | 'camera' | 'system';

const PREFIX_LAYER: Record<string, AnalysisLayer> = {
  VIEW: 'display',
  DISPLAY: 'display',
  FURN: 'display',
  MIC: 'microphone',
  AUDIO: 'audio',
  CAM: 'camera',
  SIGNAL: 'system',
  SYSTEM: 'system',
  CABLE: 'system'
};

export function overlayLayerForFinding(code: string): AnalysisLayer {
  const prefix = code.split('-')[0];
  return PREFIX_LAYER[prefix] ?? 'display';
}

export function layerHasImplementedOverlays(layer: AnalysisLayer): boolean {
  return layer === 'display' || layer === 'microphone' || layer === 'audio' || layer === 'camera';
}
