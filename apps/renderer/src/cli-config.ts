import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PipelineDeps } from './pipeline';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Pipeline dependencies from the environment, without requiring DB/queue settings. */
export function loadConfigForCli(): PipelineDeps {
  return {
    tilesUrl: process.env.TILES_INTERNAL_URL ?? 'http://localhost:3010',
    printPageDist: process.env.PRINT_PAGE_DIST ?? path.resolve(here, '../../print-page/dist'),
    tmpDir: process.env.RENDER_TMP_DIR ?? path.resolve(here, '../.tmp'),
    pdftoppm: process.env.PDFTOPPM_PATH ?? 'pdftoppm',
    ghostscript: process.env.GHOSTSCRIPT_PATH || null,
    cmykIccProfile: process.env.CMYK_ICC_PROFILE || null,
  };
}
