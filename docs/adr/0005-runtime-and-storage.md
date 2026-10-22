# 0005 — Node 22 runtime, SeaweedFS for local S3

**Status:** Accepted · 2026-10-22

- **Node 22 LTS** for every app. `@maplibre/maplibre-gl-native` ships prebuilt binaries for Node 22 ABIs but not
  for Node 23. `.nvmrc` and `engines` enforce it.
- **SeaweedFS** (Apache-2.0) replaces MinIO in local development: MinIO stopped publishing public container
  images. The app only uses the S3 API, so any S3-compatible store (AWS S3, Hetzner, OVH, Garage) works in production.
- **TypeScript 6.0** rather than 7.0: `typescript-eslint` doesn't support TS ≥ 6.1 yet.
