# SimStage AV Designer

A rebuild of the SimStage Pro prototype as a professional, modular AV room
design platform: TypeScript + Three.js, catalog-driven equipment, and an
explicit, testable engineering calculation layer.

This is delivered as a phased rebuild, matching the "work in phases, keep it
runnable" instruction in the product spec. **What's below is what's actually
implemented and passing tests today** — not a wishlist. Sections marked
"Not yet built" are scaffolded in the architecture (folders/interfaces exist)
but have no working UI yet.

## Running it

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production bundle -> dist/
npm run test     # vitest — 210 tests
```

All three commands were run and verified during this build.

## Professional workspace shell (Phase 1)

**Status: implemented** — chrome and project-first workflow only. Engineering engines are unchanged.

IMPLEMENTED
- Top navigation: Project / Design / System / Simulate / Validate plus New / Auto Design / Export
- Left **Project** tree (architecture, furniture, AV, system counts) and right **Properties** inspector
- Viewport chrome: 3D / Plan / Elevation + contextual actions (no floating bottom bar)
- Status bar: room size, selection, snap, units, validation counts
- New Project overlay (type, capacity, room, use case) mapped onto existing `DesignRequirements`
- Beginner / Pro chrome toggle (same project; Pro shows Design Assistant)

NOT IMPLEMENTED (later phases)
- Cable routing / floor boxes as a workspace
- Manufacturer furniture catalog / photoreal room
- BOQ / PDF
- Full beginner vs Pro feature hiding beyond chrome

Visual review of this shell is required before Phase 2 (furniture configurator / Plan CAD).

## Furniture / seating layout (prior increment)

**Status: implemented** — `TableSpec[]` remains the source of truth. SeatingRenderer and Plan view consume TableSpec only (no chair-row table inference).

IMPLEMENTED
- Furniture-first generator: table type/size from seat count, use case, and circulation — not a bounding box around chairs
- Generic `FurnitureSpec` templates (not manufacturer SKUs)
- Conference / classroom / U-shape / hollow-square / theater layouts
- Tabletop + support geometry; chairs with pan/back/legs
- FURN-001…007 validation (pass / warning / error with geometry)
- Auto Design **NO VALID LAYOUT** when seating cannot circulate
- Table snap/clamp inside the room envelope

NOT IMPLEMENTED
- Manufacturer furniture catalog / BOQ / photoreal materials
- Electrical specs for table connectivity (visual cable well only)

Visual acceptance of Plan/3D furniture is a separate review gate.

## Auto Design / Design Assistant (prior increment)

**Status: implemented** — existing domain engines remain the source of calculations. Auto Design is an orchestrator.

Auto Design produces a **technically reasoned starting design** from room requirements, catalog products that have the fields those engines need, and the existing Device → Port → Connection model. It is **not** manufacturer-certified engineering sign-off.

IMPLEMENTED
- Auto Design entry: Design workspace **[AUTO DESIGN]**, Project panel, contextual toolbar (optional; never forced)
- Quick / Guided / Expert modes on a structured `DesignRequirements` model
- Requirement validation (DATA INCOMPLETE / ERROR / WARNING) before generate
- Catalog candidate filtering (no invented 60°/90°/SPL/FOV/pickup)
- Proposal review (room / seating / video / audio / camera / system / validation counts)
- Catalog selection (engineering-complete products only)
- Existing equipment preservation (“Existing display retained”)
- Constraints and NO VALID DESIGN with Modify requirements / Manual design
- Manual overrides (AUTO vs MANUAL OVERRIDE) with Keep current / Review alternative
- Validation integration via existing ValidationRegistry
- Apply as one undo transaction; view state stays out of geometry history
- Real equipment instances, catalog ports, connections, and switcher routes when the catalog can support them
- Engineering rationale, **Why this design?**, optional **LEARN** notes
- Design Assistant status + recommendations after manual edits (advice only)
- Partial completion / keep existing equipment when compatible
- Expert constraints (manufacturers, size range, no wall speakers, no rear-wall gear)
- Multiple ranked options when catalog evaluations actually differ
- AUTO vs MANUAL OVERRIDE on instances
- Validation via existing `ValidationRegistry` after generation (counts, not a fake confidence %)

NOT IMPLEMENTED
- AI autonomous engineering / chat assistant
- Manufacturer-certified design
- Pricing optimization (no catalog pricing used)
- Advanced acoustics, network simulation, NVR simulation
- Cable routing optimization / BOQ / PDF / cloud
- Wall-speaker auto-layout (PlacementSuggestionEngine only proposes ceiling grids — Auto Design reports **NO VALID DESIGN** rather than inventing wall layouts)
- Microphone/camera signal paths when the catalog has no ports (DATA INCOMPLETE; ports are not invented)
- Dual-display distribution when the catalog switcher has a single output (second path not invented)

ENGINEERING DATA is shown as Complete / Partial / Incomplete — not “Confidence: 93%”.

## System design (prior increment)

**Status: implemented** — spatial engines frozen.

Device → Port → Connection remains the topology. This pass is **System workspace UX + routing state**.

IMPLEMENTED
- Professional canvas: category device cards, port glyphs, orthogonal wires, pan (Alt-drag), zoom, search, signal filters, Edit/Schematic, Beginner/Pro
- Drag-to-connect with compatible highlight; invalid reasons from PortCompatibility (SIGNAL-002…005)
- Connection inspector (signal / transport / physical medium). Cat6 extender hops are not labeled HDMI cable
- Switcher **routing matrix** from catalog ports (`routes[]` in undo snapshots)
- Signal paths respect matrix routes; incomplete paths → SYSTEM-001
- View Issue focuses System canvas; **View in Room** selects the same instance in 3D
- Diagram layout/groups/routes are undoable. Pan/zoom/filter/schematic mode are view state
- Diagram coordinates never overwrite `equipment.position`

NOT IMPLEMENTED
- BOQ, PDF, cable length, AV-over-IP physics, NVR, DISCAS, acoustics

DATA INCOMPLETE: cameras without ports; missing speaker.powerClass; missing catalog I/O

ENGINEERING ESTIMATE: spatial display/mic/speaker/camera engines unchanged

## Professional workflow / UX (prior increment)

**Status: implemented** — C3 engines frozen. This pass is shell + interaction, not a new simulation.

Primary modes are **Design / Simulate / Validate**. The seven-step wizard nav is no longer the top-level chrome. Geometry still lives in undo snapshots; overlay visibility, hide/isolate, and tree collapse do not.

- **Project tree** — Room / Furniture / AV Equipment; hide/isolate; selection sync with Plan/3D.
- **Properties** — shared inspector (identity, data status, pose) plus domain sections.
- **Simulate** — checkboxes per placed subsystem; heatmaps off until enabled.
- **Validate** — issue cards with code, metric, affected seats, View Issue. Counts, not a design score.
- **Plan align / distribute** — world XZ on multi-selected equipment.

## Design validation & simulation (prior increment)

**Status: implemented** — `npm run test` and `npm run build` succeed.

This is **not** more analysis UI. It is a validation layer on top of the existing engines.

### Workflow now in the app

**Design** / **Simulate** / **Validate** (top bar + viewport toolbar) plus **Validate Design**.

- **Design** — CAD-style edit (existing interaction).
- **Simulate** — turns on viewing overlays (seat status). Heatmaps/sightlines remain user-toggled so the scene does not become a rainbow by default.
- **Validate** — runs the check registry and lists findings.

Click **View issue** on an error/warning: affected seats are highlighted, sightlines to the display are drawn, the camera frames those seats, and a measurement HUD shows the finding code + actual vs criteria.

Design Health in the top bar and status bar is **counts** (pass / warning / error), not a fake percentage. After a geometry change, the next validation pass can report "N issues resolved" by comparing summaries.

Undo/redo still stores **geometry only**. Validation is always recomputed from the current `room/seats/tables/equipment` signature.

### Checks that actually run

| Code | Source |
|------|--------|
| DISPLAY-001 | Catalog data present / incomplete / missing display |
| DISPLAY-002 | Door/window exclusion (`displayOverlapsOpening`) |
| DISPLAY-003 | Presentation wall vs mounted wall |
| SEAT-001 | Seats exist |
| SEAT-002 | Geometric wall clearance (0.3 m) |
| VIEW-001…004 | Existing viewing-distance / H / V / visibility engines |
| VIEW-005 | Existing sightline vs tables/columns |

Recommendations are only listed when they affect that metric. **No AVIXA DISCAS claim.** Camera codes are **not** registered.

Microphone checks that actually run when catalog mics are placed:

| Code | Source |
|------|--------|
| MIC-001 | Seat vs calculated pickup region (disc or directional sector) |
| MIC-002 | Missing `pickupRadiusM` → DATA INCOMPLETE |
| MIC-003 | Directional model requested without `beamWidthDeg` → DATA INCOMPLETE |

This is a **flat-disc engineering estimate**, not beamforming physics. Overlays are rings/discs and a coverage heatmap derived from the same disc test — not decorative cones.

Speaker checks that actually run when catalog speakers are placed:

| Code | Source |
|------|--------|
| AUDIO-001 | In-dispersion estimated SPL below 70 dB (`SpeakerCoverageEngine`) |
| AUDIO-002 | No seats in the PASS/WARNING estimated-SPL band |
| AUDIO-003 | Missing `maxSplAt1m` or dispersion → DATA INCOMPLETE |
| AUDIO-004 | Seats outside every catalog dispersion region |

This is a **free-field + geometric dispersion engineering estimate**, not room-acoustic prediction.

Camera checks that actually run when catalog cameras are placed:

| Code | Source |
|------|--------|
| CAM-001 | Seat outside every catalog FOV |
| CAM-002 | Zero seats geometrically visible |
| CAM-003 | Missing `horizontalFovDeg` → DATA INCOMPLETE |
| CAM-004 | In FOV but SightlineEngine blocked (tables/columns) |

This is a **geometric frustum engineering estimate**, not photometric or NVR simulation.

### Not in this increment

- Occupant-body occlusion
- A scored Design Health percentage
- Manufacturer beamforming / polar-pattern simulation
- Room impulse response, reverberation, STI, or phase interference

## Phase B — Display viewing engine & visual analysis

**Status: implemented and verified** — `npm run test` (73 tests) and `npm run build` succeed.

Existing viewing-distance, sightline, and DesignAnalysis engines were **reused**, not replaced. UI does not invent numbers; overlays read structured engine results.

### What a designer can do now

1. Place a catalog display, select it, click **Analyze Display**.
2. See per-seat PASS / WARNING / FAIL with distance, H/V angle, visibility, sightline.
3. Toggle **seat status**, **sightlines** (selected / all), and a **viewing heatmap**.
4. Enter **Viewer Mode** from a seat, the inspector, or the project-tree **View** control (Prev/Next/Exit unchanged).
5. See the same analysis in **3D** and **2D Plan**; elevation still shows mount height, eye height, and the selected sightline.
6. Move the display — analysis and heatmap update from the new geometry (cached, not per animation frame).
7. Undo/redo still restores furniture; analysis overlays are view flags and are **not** in the undo snapshot.

### Engineering honesty

- Viewing-distance limits remain the **image-height multiplier heuristic** (4:6:8-style planning check), labeled `engineering_estimate`. **Not AVIXA DISCAS compliance.**
- Horizontal/vertical angles, behind-display visibility, and obstruction rays are **calculated**.
- Obstructions currently modeled: **tables (`TableSpec[]`) and columns**. Occupant bodies, door swings, and glazing are **not** modeled.
- Heatmap cells use the **same** `analyzeSeat` + obstruction path as seats. Not a decorative FOV cone.
- Missing product width/height shows **DATA INCOMPLETE** instead of inventing dimensions.
- Design Health foundation exposes **counts** (pass/warn/fail), not an invented percentage score.

## Simulation architecture (shared layers)

Display viewing and microphone discs stay **separate engines**. Shared infrastructure now lives under `src/av/simulation/`:

- `FloorGrid` — one floor sampling loop
- `CoverageMemo` — signature-keyed heatmap cache
- `AnalysisLayer` — finding code → overlay layer (`VIEW`/`MIC`/`AUDIO`/`CAM`)
- `HeatmapEngine` + `engine/HeatmapMesh` — status color and 3D floor heatmap

C2 plugs new **evaluators** into these layers. Do not copy the grid loop, cache, or string-prefix focus forks.

## Phase C2b — Speaker coverage and SPL estimate

**Status: implemented.** Domain logic stays in `SpeakerCoverageEngine`. Shared sampling/heatmap/validation wiring is reused; displays and microphones keep their own engines.

### Implemented

- Speaker coverage from catalog **dispersion** (conical ceiling, horizontal wall/pendant, or H+V when both catalog fields exist) plus placement **position** and **orientation** (`rotationY`).
- Estimated SPL where `maxSplAt1m` exists: `L(d) = maxSplAt1m − 20·log10(max(d, 0.3 m))` (free-field inverse-square). Labeled **ENGINEERING ESTIMATE**.
- Multiple in-dispersion speakers: **incoherent intensity sum** `10·log10(Σ 10^(Li/10))`. Not linear dB addition. Not phase interference.
- Floor heatmap and 3D/plan coverage region from the **same** `evaluateSeatAudio` / `withinDispersion` tests (`FloorGrid.sampleFloorGrid`, `HeatmapEngine`).
- AUDIO ANALYSIS panel (coverage counts, reference level, seat list) and Simulate **Analyze Coverage**.
- AUDIO-001…004 through `ValidationRegistry`. **View issue** selects the speaker, frames affected seats, and turns on coverage + heatmap overlays.
- Listening-zone field exists on seats (`main_seating` default). Zone UI is not built out.

Missing `maxSplAt1m` or dispersion → **DATA INCOMPLETE**. The app does **not** invent 100 dB or 90°.

### Not implemented

- Room impulse response
- Reverberation
- STI / RASTI
- Phase interference
- Full acoustic prediction software
- Advanced array processing

## Phase C3 — Camera geometric frustum

**Status: implemented.** Domain logic stays in `CameraCoverageEngine`. Displays, microphones, and speakers keep their own engines.

### Implemented

- Geometric camera FOV from catalog `horizontalFovDeg` (and `verticalFovDeg` when present)
- Camera orientation from placement (`rotationY` / wall `presentationRotation`); look **+Z** when facing = 0
- Floor coverage via `FloorGrid.sampleFloorGrid()`
- Obstacle/sightline blocking via existing `SightlineEngine` (tables + columns)
- Multi-camera **union** (visible if any camera is in-FOV and clear)
- Camera heatmap from the same evaluator
- CAM-001…004 validation and **View Issue** (select camera, FOV overlay, blocked sightlines)

This is a **GEOMETRIC FRUSTUM ENGINEERING ESTIMATE**.

Missing `horizontalFovDeg` → **DATA INCOMPLETE**. The app does **not** invent 60° or 90°. Missing vertical FOV uses a labeled horizontal-only model.

### Not implemented

- Pixels-on-target / resolution analysis
- Image quality
- Lux / photometric simulation
- PTZ limits / auto-framing / tracking
- Distortion / lens modeling
- NVR / network / stitching simulation

## Phase C2a — Directional microphone sectors

**Status: implemented.** Domain logic stays in `MicrophoneCoverageEngine`.

- If catalog has `pickupRadiusM` **and** `beamWidthDeg` (or `coverageModel: directional_sector` with a valid width), coverage is a **horizontal sector**: distance ≤ radius and |azimuth − facing| ≤ beamWidth/2. Facing is project `rotationY`.
- If only `pickupRadiusM` is present (existing ceiling arrays), the **disc** model remains. Pattern *text* is not parsed into a beam.
- If `directional_sector` is requested without `beamWidthDeg`: **DATA INCOMPLETE** (MIC-003). Disc is **not** substituted.
- Heatmap, plan/3D pickup overlay, and MIC-001 all use `evaluateSeatMicCoverage` / `pickupRegionFromMic`.
- UI shows MODEL / SOURCE / ASSUMPTIONS. Not beamforming, polar plots, or steerable lobes.
- Catalog includes a **user_defined placeholder** sector product so the model can be exercised. Manufacturer array SKUs were **not** given invented beam widths.

### What this pass did NOT do

- Camera FOV
- Cardioid / hypercardioid physics without catalog beam width
- Parsing free-text “beamforming” into a fake lobe

## Phase C1 — Microphone pickup discs & validation

**Status: implemented** — disc coverage from catalog `pickupRadiusM`, 3D/plan overlays, heatmap from the same engine, MIC-001 / MIC-002.

- **Simulate:** select a microphone → **Analyze Pickup** (seat status, pickup discs, optional heatmap).
- **Validate:** MIC-001 coverage gap (seats outside every rated disc); MIC-002 DATA INCOMPLETE when radius is missing.
- **View issue:** frames uncovered seats, selects a microphone, draws the calculated discs.
- Does **not** draw generic beams or claim array lobe tracking.

### What this pass did NOT do

- True beamforming / polar-pattern physics
- Camera FOV / CAM-* checks
- Occupant-head or glazing occlusion
- Licensed DISCAS implementation

### Furniture regression (explicit)

`tests/app/BoardroomUndoRedoRegression.test.ts` now includes: generate boardroom → analyze display → move display → undo/redo → 3D/Plan/3D. Single centered `conference-table` is preserved.

## Phase A regression audit (undo/redo + boardroom furniture)

**Status: PASSED** — `npm run test` (59 tests) and `npm run build` both succeed.

A dedicated regression suite was added in
`tests/app/BoardroomUndoRedoRegression.test.ts` covering the exact scenario
that previously broke (boardroom table geometry becoming wall-attached after
undo/redo). **No active regression was found** in the current codebase.

### What was tested

| Step | Scenario | Result |
|------|----------|--------|
| 1–2 | Generate 10×7 m boardroom; record `TableSpec[]`, seats, room, presentation wall | ✓ |
| 3–5 | Add display → undo | Furniture fingerprint identical; single centered `conference-table` preserved |
| 6–7 | Redo | Furniture unchanged again; equipment restored |
| 8–10 | Manual table move → undo | Original `centerX`/`centerZ` restored |
| 11–12 | Manual chair move → undo/redo | Position and `facing` survive correctly |
| 13 | Switch 3D / Plan / Elevation | `viewMode` changes do not mutate seats/tables |
| 14 | Serialize → deserialize round-trip | `TableSpec[]`, manual edits, and equipment survive |
| + | Drag gesture (`prepareHistory` → live update → `finishGesture` → undo) | Pre-drag furniture restored |
| + | Triple undo after seat + equipment edits | Table count stays 1; geometry integrity checks pass |
| + | Renderer audit | `renderSeating()` draws exactly 1 table mesh at `TableSpec` position — never inferred from chairs |

### Defensive fixes applied during audit

Even though no furniture regression was reproduced, two state-lifecycle issues
were hardened:

1. **`applySnapshot()` now deep-clones** before assigning to live state, so
   restored furniture can never share object references with history stacks.
2. **`loadProjectInto()` no longer calls `setRoom()`/`setSeats()`** (which
   pushed undo entries and could make a file load look like user edits). It
   assigns directly and calls `clearHistory()`.

### Architecture confirmed correct

- `TableSpec[]` is owned by `SeatingGenerator` and stored in `AppState.tables`
- `SeatingRenderer` renders tables from `TableSpec[]` only — no inference from seat rows
- `undo()`/`redo()` restore snapshots — they never call `generateSeating()`
- `setSeats()` is only called from the explicit "Generate Seating" button and project load

## Phase A — Interaction Foundation (latest increment)

**Built this pass:**

- **Undo/redo** — snapshot-based history in `HistoryManager.ts`; `AppState.undo()` /
  `AppState.redo()` restore real project state (room, seats, tables, equipment,
  selection). Keyboard: `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`).
- **Intelligent snapping** — `SnapEngine.ts` snaps displays to valid wall surfaces
  (never onto door/window exclusion zones), ceiling speakers/mics to ceiling height,
  using the same `RoomGeometry.computeWallCandidates()` data as placement suggestion.
- **Direct manipulation** — Three.js `TransformControls` on selected AV equipment in
  3D; drag in 2D plan view with the same snap rules. Manual moves set
  `placementMode: 'manual'` on the instance.
- **Contextual toolbar** — viewport overlay changes by selection (Move/Rotate for
  equipment, View from Seat for seats, Undo/Redo always available).
- **Object browser** — CAD-style project tree (Architecture / Furniture / AV
  Equipment) in the left panel; click to select and focus.
- **Properties inspector** — numeric X/Y/Z/rotation fields for equipment, seats, and
  tables; placement mode badge; "Snap to valid surface" button.
- **2D plan enhancements** — tables drawn; drag-to-move seats and equipment; changes
  sync to 3D via shared `AppState`.
- **Keyboard shortcuts** — `1` 3D, `2` Plan, `3` Elevation, `F` focus selected,
  `Esc` deselect / exit viewer mode.

**Not implemented yet (honest):**

- Transform gizmo on chairs/tables in 3D (inspector + plan drag only for now)
- Alignment guides, equal-spacing, center/parallel furniture snapping
- Seating group manipulation (EDIT LAYOUT / UNGROUP)
- Full elevation editing (elevation is read-only analysis view)
- Wall selection/editing in architecture browser
- Signal flow, Design Health panel, heatmaps, camera engine

## What's implemented (Phases 1–3, partial 4–5)

**Phase 1 — Architecture**
- `AppState` — single source of truth, pub/sub notify, no logic-in-UI
- `ProjectStore` — project JSON serialize/load/download
- Clean module boundaries: `room/`, `catalog/`, `av/`, `engine/`, `ui/`

**Phase 2 — Professional UI shell**
- Three-panel layout: left design workflow, center 3D viewport, right
  context-sensitive inspector, bottom status bar (§21)
- Step-driven workflow nav (Project → Room → Seating → Equipment → …)
  instead of a placement-button ribbon
- Neutral engineering-tool visual language, not a gaming dashboard

**Phase 3 — Room & Seating**
- `RoomModel` / `RoomGenerator`: real wall geometry with door/window
  cutouts via `ExtrudeGeometry` + holes (not a flat colored box)
- `RoomPresets`: 8 room-type starting dimensions (huddle → auditorium)
- `SeatingGenerator`: **algorithmic** layout generation — boardroom,
  classroom, theater, U-shape, hollow-square — driven by capacity +
  spacing rules, not manual chair placement. Honestly reports a shortfall
  warning if capacity can't physically fit rather than silently failing.
- `SeatingRenderer`: real chair/table geometry via `InstancedMesh` (tested
  up to 120-seat auditorium scenario without spawning 120 separate meshes)

**Phase 4 — Equipment catalog (started)**
- `EquipmentCatalog`: manufacturer/model/category data architecture with
  an explicit `provenance` field (`verified` / `estimated` / `user_defined`)
  on every product — the UI shows this badge on every equipment card
- Seed data: 4 displays, 4 speakers, 3 microphones with real brand/model
  names (LG, Samsung, QSC, Bose, JBL, Shure, Sennheiser). **Spec figures
  are publicly-cited numbers, marked `estimated`, not `verified`** — see
  the honesty notice at the top of `data/*.json`. Replace with your
  organization's confirmed datasheet data before using for real sign-off.
- Equipment browser UI built for displays only so far; speaker/mic
  browsers follow the identical pattern (search `renderEquipmentStep` in
  `DesignPanel.ts`) and are the next small increment, not a redesign.

**Phase 5 — Display engineering (core engines done, seat-by-seat UI partial)**
- `ViewingDistanceEngine`: pure, testable functions —
  `calculateDistance`, `calculateHorizontalViewingAngle`,
  `calculateVerticalViewingAngle`, `evaluateViewingDistance`,
  `analyzeSeat` / `analyzeAllSeats`. Every result is a structured
  `{ status, value, unit, threshold, method, provenance }` object, never
  a bare boolean.
- `AVIXA/DisplayCriteria.ts` + `StandardsRegistry.ts`: **explicitly does
  NOT claim to reproduce the licensed AVIXA DISCAS standard.** It
  implements a commonly-cited image-height multiplier heuristic and
  labels every output `engineering_estimate`. The registry lets you drop
  in the real DISCAS calculation later without touching the engines that
  consume it. Read the notice at the top of that file — this is the
  single most important honesty boundary in the whole codebase.
- `SightlineEngine`: real ray-vs-obstacle occlusion test (not just an
  angle heuristic) — projects obstacles onto the viewer→display line and
  checks line-of-sight height against obstacle height.
- Inspector panel shows live seat-by-seat analysis (distance, H/V angle,
  viewing-distance verdict, pass/warning/fail pills, methodology text)
  when a seat is selected and a display exists — this is real, not mocked.
- Seat-by-seat analysis, 3D/plan overlays, heatmap, and Viewer Mode are
  implemented — see **Phase B — Display viewing engine** above.

## What's scaffolded but has no UI yet (be honest about this)

- **Audio (Phase 6):** `SpeakerCoverageEngine.ts` is complete and tested —
  inverse-square SPL falloff clipped to rated dispersion angle, explicitly
  labeled **"Geometric Coverage Simulation"** (not an acoustic model) per
  the spec's honesty requirement. No 3D coverage-cone visualization or
  speaker browser UI yet.
- **Microphones (Phase 6):** `MicrophoneCoverageEngine.ts` complete and
  tested, including a greedy `suggestMicPlacement` heuristic. No UI.
- **Cameras (Phase C3):** `CameraCoverageEngine` geometric frustum estimate is implemented. See **Phase C3** above.
- **Signal flow / compatibility checking (Phase 7):** not started.
- **Cable engine (Phase 7):** `CableEngine.ts` is complete — rebuilds the
  old prototype's cable-routing concept as an independent module with
  real cable-class selection (HDMI vs HDBaseT, speaker wire vs 70V line,
  Dante vs analog mic) against real run-distance limits. No UI/3D route
  rendering yet.
- **Auto Design (Phase 8):** implemented as an orchestrator (proposal → apply, existing engines). See the Auto Design section above.
- **2D Plan / Elevation views:** plan view supports selection, drag-move, and
  snap-sync with 3D. Elevation is a read-only sightline diagram for the selected
  (or worst) seat — not yet a full wall editor.
- **Reporting / BOQ (Phase 9):** not started.
- **DXF import (carried over from the prototype):** not yet ported into
  this architecture.

## Design decisions worth knowing about

- **TypeScript + Vite**, not React — the panels are small enough that
  direct DOM construction (see `ui/panels/*.ts`) stays readable and avoids
  pulling in a framework before it's earned. If the UI grows past a few
  more panels, migrating `ui/` to a component framework is a contained
  change — `AppState` was designed for that (plain subscribe/notify, no
  framework coupling).
- **Every engineering function returns a structured result**, never a
  bare number or boolean, per the spec's explainability requirement.
  Testing this is what caught two real bugs during this build (a wall
  normal pointing the wrong direction, and a coverage test that assumed
  "pass" for a physically deafening SPL) — both are fixed and now covered
  by regression tests.
- **`data/*.json` provenance is honest, not aspirational.** Every seeded
  spec is `estimated`, sourced from publicly-cited figures, with a note
  telling you to verify against the current manufacturer datasheet.
  Nothing in this repo claims AVIXA compliance or verified manufacturer
  accuracy it hasn't earned.

## Latest pass: Equipment Catalog Browser + Suggested Placement

**Was NOT run this pass (no network access in this environment — see
below): `npm install`, `npm run build`, `npx tsc --noEmit`, `npm run
test`.** Everything below was instead checked with a global `tsc
--noEmit --skipLibCheck` against the whole `src/`; the only errors
reported are pre-existing "cannot find module 'three'/'vitest'"
(expected — those packages aren't installed here), and none are in
any file touched this pass. That is real signal but it is not the
same as a real `npm run build` + `npm run test` — run those yourself
before trusting this further.

**Phase A — Equipment catalog browser (built):**
- `EquipmentCatalog.ts` now models the full category list from the
  spec (`display`, `projector`, `video_wall`, `speaker`, `microphone`,
  `camera`, `dsp`, `amplifier`, `codec`, `switcher`, `control`,
  `rack`) plus a small, fixed `CATEGORY_GROUPS` browsing taxonomy
  (Displays / Projectors / Audio / Microphones / Cameras /
  Infrastructure) so categories with no seed data yet don't each need
  a bespoke empty screen — they honestly say "no catalog data" and
  point at where to add it.
- New `src/ui/panels/EquipmentBrowser.ts` replaces the old
  "Display Equipment Browser" list with: search box, category nav
  (with live per-category counts), manufacturer/size/resolution
  filters (filter options shown are only the ones that exist in the
  category), and product cards with provenance badge + spec line.
  Non-display categories currently show 0 products (still true from
  before — only displays/speakers/mics have seed data) and say so
  plainly rather than faking cards.

**Phase B — Suggested placement flow (built, displays/speakers/mics):**
- New `src/av/PlacementSuggestionEngine.ts`. "Add to Design" no
  longer silently drops a display at a hardcoded spot — it now shows
  a suggested wall / mount / center-height (with a stated rationale)
  and an ACCEPT / ADJUST choice before anything is added to the
  project. ADJUST reveals wall + height controls; ACCEPT commits.
  There was never actually a "click the floor to place object" mode
  in this codebase to remove — equipment was already added
  programmatically — so this pass's job was adding the missing
  review step, not removing a placement mode.
- Speakers and microphones get a **Design Audio** / **Design
  Microphones** flow instead of one-at-a-time placement: quantity,
  layout, and coverage % are computed by running the *same*
  `SpeakerCoverageEngine` / `MicrophoneCoverageEngine` used for
  analysis against a proposed grid/greedy layout, so the suggestion
  and the later analysis can't disagree. APPLY DESIGN adds every
  suggested unit as a real `EquipmentInstance`.
- Cameras: no suggestion logic yet (no camera engine exists — see
  below), so that category currently falls through to a plain
  "add at room center" path with an honest note, not a fake
  suggestion.

## What this pass did NOT touch (be honest about scope)

The spec asked for phases A through G in one pass; this increment is
**A and B only**, matching the spec's own fallback instruction
("start with Displays if the full catalog cannot be completed in one
increment") and its priority ordering. Not started/changed this pass:

- **Phase C — 3D display analysis visualization** (viewing
  cone/envelope, sightline rays, colored seats in the 3D view,
  distance dimensions). `SightlineEngine.ts` and
  `ViewingDistanceEngine.ts` still only feed the Inspector's numeric
  seat-by-seat panel, same as before.
- **Phase D — Viewer Mode polish.** Unchanged from before: seat
  click → Viewer Mode camera jump already existed
  (`CameraController.goToViewerPosition`, `ViewerModeOverlay.ts`,
  Previous/Next/Exit) — not extended this pass.
- **Phase E — Design Health panel wired to real objects.** Not
  started; no `DesignHealth` panel exists yet in this codebase.
- **Phase F — full contextual design for cameras.** Audio and
  microphones got a "Design X" flow this pass (see above); cameras
  did not, because there's no camera catalog data or coverage engine
  yet (`src/av` has no `CameraEngine.ts`).
- **Phase G — Auto Design.** Implemented (orchestrator). See the Auto Design section above.

Given the spec's own "don't overbuild" instruction, that prioritization
(A/B solid over seven phases shallow) was a deliberate choice, but it
means most of the requested milestone checklist (items 8–15: display
analysis in 3D, seat pass/warning/fail coloring, Design Health→camera
focus) is still not there. Items 1–7 (open room → generate seating →
browse catalog → select a display → accept a suggested position
without a floor-click mode) are real as of this pass, pending your own
`npm install && npm run build && npm run test` to confirm.
