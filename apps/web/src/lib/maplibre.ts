import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// maplibre-gl 6 resolves its worker relative to its own module URL, which breaks after bundling.
maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
export type { Map as MapLibreMap, MapOptions } from 'maplibre-gl';
