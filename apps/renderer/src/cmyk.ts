import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export class CmykUnavailableError extends Error {}

/** PostScript that embeds the output profile as a PDF/X OutputIntent. */
function pdfxDef(iccPath: string, condition: string): string {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  return `%!
/ICCProfile (${esc(iccPath)}) def
[/_objdef {icc_PDFX} /type /stream /OBJ pdfmark
[{icc_PDFX} <</N 4>> /PUT pdfmark
[{icc_PDFX} ICCProfile (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFX} /type /dict /OBJ pdfmark
[{OutputIntent_PDFX} <<
  /Type /OutputIntent
  /S /GTS_PDFX
  /OutputCondition (${esc(condition)})
  /OutputConditionIdentifier (${esc(condition)})
  /RegistryName (http://www.color.org)
  /DestOutputProfile {icc_PDFX}
>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {OutputIntent_PDFX} ]>> /PUT pdfmark
`;
}

/**
 * "Print shop PDF" (plan §7.4, v1): converts the sRGB PDF to CMYK with the configured output profile
 * (e.g. ISO Coated v2 / FOGRA39 from ECI) using Ghostscript, and writes a PDF/X-3 output intent.
 * Disabled unless both Ghostscript and the profile are configured.
 */
export async function convertPdfToCmyk(
  pdf: Buffer,
  { ghostscript, iccProfile, tmpDir }: { ghostscript: string | null; iccProfile: string | null; tmpDir: string },
): Promise<Buffer> {
  if (!ghostscript || !iccProfile) throw new CmykUnavailableError('CMYK output is not configured on this renderer');
  const dir = await mkdtemp(path.join(tmpDir, 'cmyk-'));
  try {
    const input = path.join(dir, 'in.pdf');
    const output = path.join(dir, 'out.pdf');
    const def = path.join(dir, 'pdfx_def.ps');
    await writeFile(input, pdf);
    await writeFile(def, pdfxDef(iccProfile, 'FOGRA39'));
    await run(
      ghostscript,
      [
        '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
        `--permit-file-read=${iccProfile}`,
        `--permit-file-read=${dir}/`,
        '-sDEVICE=pdfwrite',
        '-dPDFX',
        '-dCompatibilityLevel=1.4',
        '-sColorConversionStrategy=CMYK',
        '-sProcessColorModel=DeviceCMYK',
        `-sOutputICCProfile=${iccProfile}`,
        '-dRenderIntent=1',
        '-dAutoRotatePages=/None',
        '-dDownsampleColorImages=false',
        '-dColorImageFilter=/FlateEncode',
        '-dAutoFilterColorImages=false',
        `-sOutputFile=${output}`,
        def,
        input,
      ],
      { timeout: 4 * 60_000 },
    );
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
