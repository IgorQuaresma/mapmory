import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { ExportGeometry } from '@mapmory/poster-core';

const PT_PER_MM = 72 / 25.4;

/**
 * Sets TrimBox/BleedBox so print shops can find the trim and bleed (Chromium cannot write them),
 * and replaces Chromium's metadata with neutral values.
 */
export async function finalizePdf(
  pdf: Buffer,
  geometry: ExportGeometry,
  title: string,
  /** PDF/X-3 forbids object streams (PDF 1.5+), so CMYK output is saved without them. */
  { objectStreams = true }: { objectStreams?: boolean } = {},
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const page = doc.getPage(0);
  const { width, height } = page.getSize();
  const slug = geometry.slugMm * PT_PER_MM;
  const bleed = geometry.bleedMm * PT_PER_MM;
  page.setBleedBox(slug, slug, width - 2 * slug, height - 2 * slug);
  page.setTrimBox(slug + bleed, slug + bleed, width - 2 * (slug + bleed), height - 2 * (slug + bleed));
  doc.setTitle(title || 'Mapmory poster');
  doc.setProducer('Mapmory');
  doc.setCreator('Mapmory');
  doc.setSubject('Map data © OpenStreetMap contributors (ODbL)');
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());
  doc.catalog.set(PDFName.of('Lang'), PDFString.of('und'));
  return Buffer.from(await doc.save({ useObjectStreams: objectStreams }));
}
