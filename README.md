# AudioWorld

[![Support me on Patreon](https://img.shields.io/badge/Patreon-Support%20me-F96854?logo=patreon&logoColor=white)](https://www.patreon.com/AndersBjarby)

A geolocation **spatial-audio experience**. Authors place audio sources on a map; users
walk into the soundscape on their phone and hear **where** each sound is (direction, via the
device compass) and **how far away** it is (distance attenuation) — in real headphone 3D.

- **Admin** (desktop-first): a Leaflet map to create courses and place/configure audio points.
- **Client** (mobile-first PWA): GPS + compass + Web Audio HRTF spatialization, with a heading-up radar HUD.
- **Server**: Express + PostgreSQL REST API + audio uploads.
- **Shared**: one TypeScript package with all domain types and the geo/movement math, imported by every workspace.

> Status: **milestone 1** — all five point types working single-user. No auth/roles yet (that's next).

## The five point types

| Type | Behaviour | Key fields |
|------|-----------|------------|
| **Static** | Fixed source, audible within a radius | `center`, `radius` |
| **Static circling** | Orbits a fixed center | `center`, `circleRadius`, `speed`, `radius` |
| **Path** | Continuously travels a polyline | `path`, `radius`, `speed`, `endBehavior` |
| **Follow-the-user** | Sits until you enter, then follows you | `center`, `initialRadius` |
| **Path-triggered** | Rests at the path start until you're near, then travels | `path`, `triggerRadius`, `speed`, `endBehavior` |

All movement is **deterministic and computed client-side** from a shared clock (`shared/src/movement.ts` →
`resolveSource`), so the audio stays smooth without per-frame server round-trips.

## Architecture notes

- **Direction of sound uses the compass** (`DeviceOrientation` / `webkitCompassHeading`), not GPS heading
  (which is course-over-ground and useless when standing still). On iOS it needs a tap + `requestPermission()` and **HTTPS**.
- **Spatialization is client-side**: Web Audio `PannerNode` (HRTF) for direction; a `GainNode` with our own
  distance attenuation for loudness (panner `rolloffFactor = 0`), so the audio mix and the radar HUD match exactly.
- **Heterogeneous points → one table**: `audio_points` has common columns plus a `config` JSONB for the
  type-specific geometry; the server maps rows to the discriminated `AudioPoint` union.

## Ports

| Service | URL |
|---------|-----|
| Server (API + uploads) | http://localhost:3001 |
| Admin | http://localhost:5175 |
| Client | http://localhost:5174 |
| PostgreSQL (Docker) | localhost:**5434** |

## Quick start

```bash
# 1. Start PostgreSQL (zero-install, via Docker)
npm run db:up

# 2. Install everything (npm workspaces)
npm install

# 3. Create the schema + synthesize demo tones + seed the "Stockholm Demo" course
npm run db:setup

# 4. Run all three services (builds shared first, then server + admin + client)
npm run dev
```

Then open the **admin** at http://localhost:5175 and the **client** at http://localhost:5174.

### Try it on your desktop — simulation mode

The client can't use a real GPS/compass on a laptop, so add `?sim=1`:

```
http://localhost:5174/?sim=1
```

Move with **WASD / arrow keys**, turn your heading with **Q / E** (or the slider / drag the radar).
You start on the first point of the course. Put on headphones — the tones pan and attenuate as you walk and turn.
`?course=<id>` deep-links straight into a course.

### Try it on a real phone

GPS + compass require a **secure context**. Expose the client over HTTPS (e.g. an ngrok/Cloudflare tunnel to
`:5174`, with `VITE_API_URL` pointing at a tunnel to `:3001`), open it on the phone, tap **Start**, and grant
location + motion access.

## Project structure

```
audioworld/
├── shared/   # @audioworld/shared — types.ts, geo.ts, movement.ts (the contract)
├── server/   # Express + pg REST API, uploads, DB schema + seed
├── admin/    # React + Vite + Leaflet authoring UI
├── client/   # React + Vite PWA — the spatial experience
└── docker-compose.yml  # PostgreSQL 16
```

## Useful scripts

```bash
npm run typecheck    # typecheck every workspace
npm run build:shared # rebuild the shared package (needed after editing shared/src)
npm run db:down      # stop PostgreSQL
```

## Roadmap

- User registration/login + roles (superuser / admin / basic) and course ownership
- Live admin → client updates (WebSocket) so edits appear without reload
- Audio-source metadata browser and per-course cover art
- Path editing polish (insert/reorder vertices), altitude, elevation-aware attenuation
