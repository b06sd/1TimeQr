/**
 * Filesystem-based storage layer — temporary replacement for MongoDB.
 * Data is persisted as a JSON file at data/scans.json.
 *
 * TO SWITCH BACK TO MONGODB: revert database.ts and ticketController.ts
 * to use ScanRecord (Mongoose model) and delete this file.
 */
import fs from "fs";
import path from "path";

export interface ScanEntry {
  scanNonce: string;
  ipAddress: string;
  userAgent: string;
  admittedAt: string; // ISO 8601
}

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "scans.json");

// ─── In-memory mutex ─────────────────────────────────────────
// Serialises concurrent writes so two simultaneous taps never
// both read "count < capacity" and both succeed.
let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  // Keep the queue moving even if task throws
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
// ─────────────────────────────────────────────────────────────

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): ScanEntry[] {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as ScanEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: ScanEntry[]): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), "utf8");
}

// ─── Public API ──────────────────────────────────────────────

/** Total number of admitted guests. */
export function countAdmitted(): number {
  return readAll().length;
}

/**
 * Attempt to admit a guest.
 * Returns { admitted: true } on success,
 *         { admitted: false, reason: 'full' | 'duplicate' } otherwise.
 * Serialised via mutex — safe under concurrent requests.
 */
export function tryAdmit(
  entry: Omit<ScanEntry, "admittedAt">,
  capacity: number,
): Promise<
  | { admitted: true; count: number }
  | { admitted: false; reason: "full" | "duplicate" }
> {
  return enqueue(async () => {
    const entries = readAll();

    if (entries.length >= capacity) {
      return { admitted: false, reason: "full" as const };
    }

    // Duplicate nonce guard (double-tap on the same page load)
    if (entries.some((e) => e.scanNonce === entry.scanNonce)) {
      return { admitted: false, reason: "duplicate" as const };
    }

    const newEntry: ScanEntry = {
      ...entry,
      admittedAt: new Date().toISOString(),
    };
    entries.push(newEntry);
    writeAll(entries);

    return { admitted: true, count: entries.length };
  });
}

/** Paginated list of all scan entries, newest first. */
export function listEntries(
  page: number,
  limit: number,
): { records: ScanEntry[]; total: number } {
  const all = readAll().reverse(); // newest first
  const total = all.length;
  const records = all.slice((page - 1) * limit, page * limit);
  return { records, total };
}
