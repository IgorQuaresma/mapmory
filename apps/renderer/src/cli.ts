/**
 * Renders a design JSON file without the queue/DB — for local checks and benchmarks.
 * Usage: pnpm render <design.json> <out-file> [format=pdf] [dpi=300] [bleedMm=3] [cropMarks=false]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { ExportOptionsSchema, migrateDesign } from '@mapmory/design-schema';
import { closeBrowser } from './compose';
import { loadConfigForCli } from './cli-config';
import { runExportPipeline } from './pipeline';

const [designPath, outPath, format = 'pdf', dpi = '300', bleed = '3', crop = 'false'] = process.argv.slice(2);
if (!designPath || !outPath) {
  console.error('Usage: pnpm render <design.json> <out-file> [format] [dpi] [bleedMm] [cropMarks]');
  process.exit(2);
}
const design = migrateDesign(JSON.parse(await readFile(designPath, 'utf8')));
const options = ExportOptionsSchema.parse({ format, dpi: Number(dpi), bleedMm: Number(bleed), cropMarks: crop === 'true', colorProfile: 'srgb' });
const t0 = performance.now();
try {
  const result = await runExportPipeline(design, options, loadConfigForCli(), (stage, p) => console.error(`… ${stage} ${p}%`));
  await writeFile(outPath, result.body);
  console.log(JSON.stringify({ out: outPath, bytes: result.body.length, totalMs: Math.round(performance.now() - t0), ...result.timings }));
} finally {
  await closeBrowser();
}
