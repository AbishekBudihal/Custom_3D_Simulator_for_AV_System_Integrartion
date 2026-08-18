/**
 * Present catalog fields without inventing missing specs.
 */

import { resolveProductPorts } from '../system/PortResolver';
import type { EquipmentProduct } from './EquipmentCatalog';

export const NOT_SPECIFIED = 'Not specified';

export function m(meters: number | undefined): string {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return NOT_SPECIFIED;
  return `${meters.toFixed(2)} m`;
}

export function mm(meters: number | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return NOT_SPECIFIED;
  return `${Math.round(meters * 1000)} mm`;
}

export function kg(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return NOT_SPECIFIED;
  return `${value} kg`;
}

export function deg(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return NOT_SPECIFIED;
  return `${value}°`;
}

export function typeLabel(product: EquipmentProduct): string {
  return product.type.replace(/_/g, ' ');
}

export function mountSummary(product: EquipmentProduct): string {
  const bits: string[] = [];
  if (product.speaker?.mount) bits.push(product.speaker.mount);
  else if (product.camera?.mount) bits.push(product.camera.mount);
  else if (product.microphone?.mount) bits.push(product.microphone.mount);
  if (product.mounting?.vesa) bits.push(`VESA ${product.mounting.vesa}`);
  const allowed: string[] = [];
  if (product.mounting?.wall) allowed.push('wall');
  if (product.mounting?.ceiling) allowed.push('ceiling');
  if (product.mounting?.table) allowed.push('table');
  if (product.mounting?.rack) allowed.push('rack');
  if (product.mounting?.freestanding) allowed.push('freestanding');
  if (allowed.length) bits.push(`allowed: ${allowed.join(', ')}`);
  return bits.length ? bits.join(' · ') : NOT_SPECIFIED;
}

export function inputSummary(product: EquipmentProduct): string {
  const { ports } = resolveProductPorts(product);
  if (ports.length) {
    return ports.map((p) => p.label).join(', ');
  }
  const c = product.connectivity;
  if (!c) return NOT_SPECIFIED;
  const parts: string[] = [];
  if (c.hdmi) parts.push(`HDMI × ${c.hdmi}`);
  if (c.displayPort) parts.push(`DisplayPort × ${c.displayPort}`);
  if (c.usb) parts.push(`USB × ${c.usb}`);
  if (c.ethernet) parts.push('LAN');
  return parts.length ? parts.join(', ') : NOT_SPECIFIED;
}

export function catalogCardLine(product: EquipmentProduct): string {
  if (product.display) {
    return `${product.display.diagonalInches}" · ${product.display.resolution} · ${product.display.brightnessNits} cd/m²`;
  }
  if (product.speaker) {
    const disp =
      product.speaker.dispersionDeg != null
        ? `${product.speaker.dispersionDeg}° coverage`
        : product.speaker.horizontalDispersionDeg != null
          ? `${product.speaker.horizontalDispersionDeg}° H coverage`
          : NOT_SPECIFIED;
    return `${product.speaker.mount} · ${disp}`;
  }
  if (product.microphone) {
    const r = product.microphone.pickupRadiusM != null ? `${product.microphone.pickupRadiusM} m pickup` : NOT_SPECIFIED;
    return `${product.microphone.mount} · ${product.microphone.pattern} · ${r}`;
  }
  if (product.camera) {
    return `${product.camera.mount} · HFOV ${deg(product.camera.horizontalFovDeg)} · VFOV ${deg(product.camera.verticalFovDeg)}`;
  }
  return typeLabel(product);
}
