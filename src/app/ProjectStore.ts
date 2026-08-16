/**
 * ProjectStore.ts
 * Serialization boundary between AppState (live, mutable) and the
 * on-disk / exportable project JSON format described in the spec
 * (§28 PROJECT FILE FORMAT). Kept separate from AppState so the
 * file format can evolve independently of runtime state shape.
 */

import type { AppState } from './AppState';
import type { RoomModel } from '../room/RoomModel';
import type { Seat, TableSpec } from '../room/SeatingGenerator';
import type { EquipmentInstance } from '../catalog/EquipmentCatalog';

export interface ProjectFile {
  project: {
    name: string;
    designer: string;
    createdAt: string;
    version: string;
    roomUseCase: string;
  };
  room: RoomModel | null;
  seating: Seat[];
  /** Furniture (tables) belonging to the current seating layout. Optional
   *  on read so older project files (saved before tables were their own
   *  entity) still load — they'll just come back with no tables until the
   *  user regenerates seating. */
  tables?: TableSpec[];
  racks?: import('../av/AVRack').AVRack[];
  equipment: EquipmentInstance[];
  connections?: import('../system/SystemTypes').SystemConnection[];
  routes?: import('../system/SystemTypes').SystemRoute[];
  settings: {
    viewMode: string;
  };
}

const FORMAT_VERSION = '0.2.0';

export function serializeProject(state: AppState): ProjectFile {
  return {
    project: {
      name: state.project.name,
      designer: state.project.designer,
      createdAt: state.project.createdAt,
      version: FORMAT_VERSION,
      roomUseCase: state.project.roomUseCase
    },
    room: state.room,
    seating: state.seats,
    tables: state.tables,
    racks: state.racks,
    equipment: state.equipment,
    connections: state.connections,
    routes: state.routes,
    settings: {
      viewMode: state.viewMode
    }
  };
}

export function downloadProject(state: AppState): void {
  const data = serializeProject(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${data.project.name.replace(/\s+/g, '_') || 'project'}.simstage.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function loadProjectInto(state: AppState, file: ProjectFile): void {
  state.project.name = file.project.name;
  state.project.designer = file.project.designer;
  state.project.roomUseCase = file.project.roomUseCase as AppState['project']['roomUseCase'];
  // Direct assignment — never route through setRoom/setSeats here, which would
  // push undo history entries and could make a load look like a user edit.
  state.room = file.room ? JSON.parse(JSON.stringify(file.room)) : null;
  state.seats = JSON.parse(JSON.stringify(file.seating ?? []));
  state.tables = JSON.parse(JSON.stringify(file.tables ?? []));
  state.racks = JSON.parse(JSON.stringify(file.racks ?? []));
  state.equipment = JSON.parse(JSON.stringify(file.equipment ?? []));
  state.connections = JSON.parse(JSON.stringify(file.connections ?? []));
  state.routes = JSON.parse(JSON.stringify(file.routes ?? []));
  state.clearHistory();
  state.notify();
}
