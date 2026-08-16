import { describe, it, expect } from 'vitest';
import { loadDefaultCatalog } from '../../src/catalog/loadCatalog';
import { catalogCardLine, mm, mountSummary, NOT_SPECIFIED } from '../../src/catalog/CatalogPresentation';

const catalog = loadDefaultCatalog();

describe('Catalog presentation', () => {
  it('exposes manufacturer identity and mm dimensions without inventing missing specs', () => {
    const display = catalog.get('lg-86uh5j')!;
    expect(display.manufacturer.length).toBeGreaterThan(1);
    expect(display.model.length).toBeGreaterThan(1);
    expect(mm(display.physical.width)).toMatch(/mm$/);
    expect(catalogCardLine(display)).toContain(String(display.display?.diagonalInches));
    expect(mountSummary(display)).not.toBe('');
  });

  it('labels missing camera vertical FOV as not specified', () => {
    const cam = catalog.all().find((p) => p.category === 'camera')!;
    const line = catalogCardLine(cam);
    if (cam.camera?.verticalFovDeg == null) {
      expect(line).toContain(NOT_SPECIFIED);
    }
  });
});
