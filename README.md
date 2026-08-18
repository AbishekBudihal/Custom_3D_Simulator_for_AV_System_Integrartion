# AV Design & Room Simulator

A web-based AV room design and simulation tool for planning meeting,
conference, training, and flexible-room AV systems.

## Features

- Room and furniture layout
- Conference and flexible seating layouts
- AV equipment placement
- AV rack planning and rack elevation
- Display viewing analysis
- Camera FOV analysis
- Geometric speaker coverage
- Microphone pickup analysis
- System connectivity and cable planning
- Design validation

## Tech Stack

- TypeScript
- Three.js
- Vite
- Vitest

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run test
npm run build
```

## Web

The application can be deployed as a static Vite application.

Build:

```bash
npm run build
```

Production output:

`dist/`

No backend or environment variables are required. Vercel: build command `npm run build`, output directory `dist`.

## Status

Active development. Geometric coverage and cable routes are estimates, not
acoustic or BIM-accurate predictions.
