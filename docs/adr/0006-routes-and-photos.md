# 0006 — Routes, photos and free text (design schema v3)

**Status:** Accepted · 2026-10-25

## Context

People want to show a trip (a honeymoon route, a hike) and add their own photo and short notes anywhere on the
poster. Both features add user-supplied data to the print path, which the plan keeps narrow on purpose (§4.1, §8.1).

## Decisions

**Routes**

- GPX and GeoJSON files are parsed **in the browser** (DOMParser; browsers do not resolve external XML entities).
  The server never parses GPX, so there is no server-side XML attack surface. The design stores only plain
  coordinates, validated by the schema: at most 5 routes × 1,000 points, rounded to ~1 m.
- Tracks are simplified with Ramer–Douglas–Peucker until they fit (`poster-core/simplifyRoute`); a 5,000-point
  track stays within 5 m of the original line.
- Routes are drawn by the **map renderers** as a GeoJSON source (solid, dashed or dotted lines, a casing, start/end
  dots), not by the overlay. Preview and print therefore match like the streets do (ADR 0001).
- "Connect my places" draws straight lines between the markers. Road-following routing would need a routing
  engine (e.g. OSRM on OSM data); it's left for later.

**Photos**

- Uploads (JPEG, PNG, WebP, ≤ 15 MB, ≤ 60 Mpx) are **decoded and re-encoded** by libvips (sharp) in the API:
  orientation applied, ≤ 4,000 px, sRGB, JPEG. sharp writes no metadata, so **EXIF, GPS position, XMP and camera
  details are removed** (verified by an integration test with a GPS-tagged photo). Re-encoding also neutralises
  malformed files before a browser or Chromium decodes them.
- Files live in the private bucket (`photos/<project>/<id>.jpg`), rows in `photos` (cascade-deleted with the
  project). Project deletion, account deletion and the anonymous-project expiry delete the files too.
- Designs reference a photo by **id only**, never a URL. The browser loads photos through the API (same origin,
  CSP unchanged); share links serve only that project's photos. The renderer reads them from storage, only for the
  export's own project, and fails with `photo_missing` if one is gone.
- Preflight warns below 150 pixels per inch at the printed size (`photo-low-resolution`).

**Free text**

- A text can use `slot: 'free'` with a `freePosition` and a rotation; it is dragged on the preview. Up to 12 text
  blocks per poster.

**Schema v3** adds `routes`, `photos`, `freePosition` and `rotationDeg`; the v2 → v3 migration fills empty values,
so every saved poster opens unchanged. `MAX_DESIGN_BYTES` rises to 192 KB for route coordinates.

## Consequences

- The API image now carries one native dependency (sharp, musl build): 317 MB instead of 273 MB.
- Photos are personal data: they follow the project's retention and are included in the data export (as a list;
  the files themselves are downloadable while signed in).
