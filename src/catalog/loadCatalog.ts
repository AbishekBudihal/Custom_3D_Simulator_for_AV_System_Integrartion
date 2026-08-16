import { EquipmentCatalog, type EquipmentProduct } from './EquipmentCatalog';
import displaysJson from '../../data/displays.json';
import speakersJson from '../../data/speakers.json';
import microphonesJson from '../../data/microphones.json';
import camerasJson from '../../data/cameras.json';
import systemDevicesJson from '../../data/system-devices.json';

export function loadDefaultCatalog(): EquipmentCatalog {
  const catalog = new EquipmentCatalog();
  catalog.register(displaysJson as EquipmentProduct[]);
  catalog.register(speakersJson as EquipmentProduct[]);
  catalog.register(microphonesJson as EquipmentProduct[]);
  catalog.register(camerasJson as EquipmentProduct[]);
  catalog.register(systemDevicesJson as EquipmentProduct[]);
  return catalog;
}
