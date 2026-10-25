import { z } from 'zod';
import {
  BLEED_OPTIONS_MM,
  COLOR_PROFILES,
  DISCIPLINES,
  EXPORT_DPIS,
  EXPORT_FORMATS,
  MOODS,
  SPORT_EVENTS,
} from './catalog';
import { DesignSchema, LngLat, MAX_LEGS, MAX_RACE_SECONDS } from './design';

/** Maximum memory text length accepted by the interpretation endpoint (plan §8.3). */
export const MAX_MEMORY_TEXT = 1000;

/**
 * Structured output of the interpretation step (plan §9). The model never returns coordinates,
 * URLs or style data: only place *queries*, which the geocoder resolves.
 */
export const InterpretationSchema = z.object({
  language: z.string().regex(/^[a-z]{2}$/),
  places: z
    .array(
      z.object({
        query: z.string().min(1).max(200),
        role: z.enum(['primary', 'secondary']),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(5),
  date: z.object({
    iso: z
      .string()
      .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
      .nullable(),
    precision: z.enum(['day', 'month', 'year', 'unknown']),
  }),
  mood: z.enum(MOODS),
  titleIdeas: z.array(z.string().min(1).max(80)).max(3),
  subtitleIdea: z.string().max(120).nullable(),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

export const PLACE_TYPES = [
  'poi',
  'house',
  'street',
  'district',
  'city',
  'county',
  'state',
  'country',
  'other',
] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const BBox = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const GeocodeResultSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(200),
  label: z.string().max(300),
  lngLat: LngLat,
  /** [west, south, east, north] */
  bbox: BBox.nullable(),
  type: z.enum(PLACE_TYPES),
  city: z.string().max(200).nullable(),
  country: z.string().max(200).nullable(),
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;

export const InterpretRequestSchema = z.object({
  text: z.string().trim().min(3).max(MAX_MEMORY_TEXT),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  altcha: z.string().max(4000).optional(),
});

export const InterpretResponseSchema = z.object({
  interpretation: InterpretationSchema,
  /** One entry per interpreted place, with ranked geocoder candidates. */
  places: z.array(
    z.object({
      query: z.string(),
      role: z.enum(['primary', 'secondary']),
      candidates: z.array(GeocodeResultSchema),
    }),
  ),
  /** True when the LLM was unavailable and a heuristic fallback was used. */
  fallback: z.boolean(),
});
export type InterpretResponse = z.infer<typeof InterpretResponseSchema>;

/** The race found in a memory (or set by the user) that turns the draft into a race poster. */
export const DraftSportSchema = z.object({
  event: z.enum(SPORT_EVENTS),
  /** Event name as written, e.g. "Ironman Frankfurt"; used as the title when there is no other. */
  name: z.string().max(80).nullable(),
  legs: z
    .array(
      z.object({
        discipline: z.enum(DISCIPLINES),
        distanceKm: z.number().min(0).max(5000).nullable(),
        timeS: z.number().int().min(0).max(MAX_RACE_SECONDS).nullable(),
      }),
    )
    .min(1)
    .max(MAX_LEGS),
  finishTimeS: z.number().int().min(0).max(MAX_RACE_SECONDS).nullable(),
});
export type DraftSport = z.infer<typeof DraftSportSchema>;

export const DraftInputSchema = z.object({
  places: z.array(GeocodeResultSchema).min(1).max(5),
  title: z.string().max(120).nullable(),
  subtitle: z.string().max(120).nullable(),
  date: InterpretationSchema.shape.date,
  mood: z.enum(MOODS),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  /** Present for a race poster: one map panel per leg. */
  sport: DraftSportSchema.optional(),
});
export type DraftInput = z.infer<typeof DraftInputSchema>;

export const CreateProjectRequestSchema = z.object({
  draft: DraftInputSchema,
  /** Opt-in: keep the raw memory text (stored encrypted). Discarded by default (plan §8.4). */
  keepMemoryText: z.boolean().default(false),
  memoryText: z.string().max(MAX_MEMORY_TEXT).optional(),
});

export const ExportOptionsSchema = z
  .object({
    format: z.enum(EXPORT_FORMATS),
    dpi: z.literal(EXPORT_DPIS),
    bleedMm: z.literal(BLEED_OPTIONS_MM),
    cropMarks: z.boolean(),
    colorProfile: z.enum(COLOR_PROFILES),
  })
  .superRefine((o, ctx) => {
    if (o.cropMarks && o.bleedMm === 0) {
      ctx.addIssue({ code: 'custom', path: ['cropMarks'], message: 'Crop marks require bleed' });
    }
    if (o.colorProfile !== 'srgb' && o.format !== 'pdf') {
      ctx.addIssue({ code: 'custom', path: ['colorProfile'], message: 'CMYK output is only available as PDF' });
    }
  });
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

export const EXPORT_STATUSES = [
  'queued',
  'rendering',
  'composing',
  'uploading',
  'done',
  'failed',
  'expired',
] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const ExportJobSchema = z.object({
  id: z.string(),
  status: z.enum(EXPORT_STATUSES),
  progress: z.number().min(0).max(100),
  options: ExportOptionsSchema,
  errorCode: z.string().nullable(),
  bytes: z.number().nullable(),
  downloadUrl: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type ExportJob = z.infer<typeof ExportJobSchema>;

export const SaveDesignRequestSchema = z.object({ design: DesignSchema });
