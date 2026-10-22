/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MOCK?: string;
  readonly VITE_TILES_URL?: string;
  readonly VITE_MOCK_EXPORT_MS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
