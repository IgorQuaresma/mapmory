import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Design, DraftInput, ExportOptions, ExportStatus } from '@mapmory/design-schema';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/* ---------- Better Auth tables (managed through the drizzle adapter, plan §3) ---------- */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/* ---------- Application tables (plan §4.2) ---------- */

export const anonSessions = pgTable('anon_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'cascade' }),
    ownerAnonId: uuid('owner_anon_id').references(() => anonSessions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** AES-256-GCM encrypted memory text; only stored on explicit opt-in (plan §8.4). */
    memoryTextEnc: bytea('memory_text_enc'),
    /** The structured fields the user accepted (draft input) — never the raw model output. */
    interpretation: jsonb('interpretation').$type<DraftInput | null>(),
    currentRevision: integer('current_revision').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    /** Anonymous projects expire after the retention period; owned projects have no expiry. */
    expiresAt: ts('expires_at'),
  },
  (t) => [
    index('projects_owner_user_idx').on(t.ownerUserId),
    index('projects_owner_anon_idx').on(t.ownerAnonId),
    index('projects_expires_idx').on(t.expiresAt),
    check('projects_single_owner', sql`(${t.ownerUserId} IS NULL) <> (${t.ownerAnonId} IS NULL)`),
  ],
);

export const designRevisions = pgTable(
  'design_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    document: jsonb('document').$type<Design>().notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('design_revisions_project_rev_idx').on(t.projectId, t.revision)],
);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => designRevisions.id, { onDelete: 'cascade' }),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    options: jsonb('options').$type<ExportOptions>().notNull(),
    optionsHash: text('options_hash').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').$type<ExportStatus>().notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    errorCode: text('error_code'),
    objectKey: text('object_key'),
    bytes: bigint('bytes', { mode: 'number' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    expiresAt: ts('expires_at'),
  },
  (t) => [
    index('export_jobs_dedupe_idx').on(t.contentHash, t.optionsHash, t.status),
    index('export_jobs_user_status_idx').on(t.requestedBy, t.status),
    index('export_jobs_expires_idx').on(t.expiresAt),
    check(
      'export_jobs_status_check',
      sql`${t.status} IN ('queued','rendering','composing','uploading','done','failed','expired')`,
    ),
  ],
);

/**
 * Uploaded photos, owned by a project. The stored object is a re-encoded JPEG without metadata (no EXIF/GPS);
 * designs reference photos by id only (plan §4.1).
 */
export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('photos_project_idx').on(t.projectId)],
);

/**
 * Read-only preview links (plan §12 v1). Only a SHA-256 of the token is stored; a new link revokes the old one.
 */
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('share_links_project_idx').on(t.projectId)],
);

/** Security-relevant events only; never content (plan §4.2). */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    ipHash: text('ip_hash'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_events_created_idx').on(t.createdAt)],
);
