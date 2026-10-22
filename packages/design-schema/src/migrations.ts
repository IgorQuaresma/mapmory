import { SCHEMA_VERSION, parseDesign, type Design } from './design';

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration chain keyed by the version a function upgrades *from*. When `SCHEMA_VERSION` is bumped,
 * add `migrations[n] = (v_n) => v_{n+1}` so saved designs keep working (plan §4.1).
 */
const migrations: Record<number, Migration> = {};

export function migrateDesign(input: unknown): Design {
  if (typeof input !== 'object' || input === null) throw new Error('Design must be an object');
  let doc = input as Record<string, unknown>;
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : NaN;
  if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
    throw new Error(`Unsupported design schema version: ${String(doc.schemaVersion)}`);
  }
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`Missing migration from v${version}`);
    doc = step(doc);
    version += 1;
    doc.schemaVersion = version;
  }
  return parseDesign(doc);
}
