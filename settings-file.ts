import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException)?.code;

function resolveTarget(file: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    return fs.realpathSync(file);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    // Do not replace a dangling symlink with a regular file.
    if (fs.lstatSync(file, { throwIfNoEntry: false })) throw error;
    return path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
  }
}

function readSettings(file: string): { document: Record<string, unknown>; mode?: number } {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat) return { document: {} };
  if (!stat.isFile()) throw new Error(`Not a settings file: ${file}`);
  const document: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`Expected a settings object in ${file}`);
  }
  return { document: document as Record<string, unknown>, mode: stat.mode & 0o777 };
}

function publish(file: string, document: Record<string, unknown>, mode?: number): void {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, "wx", mode ?? 0o600);
  try {
    try {
      fs.writeFileSync(fd, JSON.stringify(document, null, 2) + "\n", "utf8");
      if (mode !== undefined) fs.fchmodSync(fd, mode);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* preserve the original error */ }
    throw error;
  }
}

/** Serialize cooperating writers around read, update and atomic publication. */
export function updateSettingsFile(
  file: string,
  update: (document: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  const target = resolveTarget(file);
  const lock = path.join(path.dirname(target), `.${path.basename(target)}.write.lock`);
  const deadline = performance.now() + 500;
  let fd: number;
  for (;;) {
    try {
      fd = fs.openSync(lock, "wx", 0o600);
      break;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      if (performance.now() >= deadline) {
        // Never steal a lock from a paused writer. After a crash, remove it only
        // after confirming the owner recorded inside the lock is no longer running.
        throw new Error(`Settings write lock is busy: ${lock}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    fs.writeFileSync(fd, `${process.pid}\n`, "utf8");
    const { document, mode } = readSettings(target);
    const next = update(document);
    publish(target, next, mode);
    return next;
  } finally {
    try { fs.closeSync(fd); } finally { fs.unlinkSync(lock); }
  }
}
