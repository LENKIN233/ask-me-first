/**
 * Atomic file write utility
 *
 * Prevents data corruption from crashes/power-loss during writes.
 * Strategy: write to temp file in same directory, then rename (atomic on same filesystem).
 */

import { writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';

/**
 * Write data to a file atomically.
 *
 * 1. Writes to a temporary file in the same directory (same filesystem = atomic rename).
 * 2. Renames temp file to target path (atomic on POSIX; best-effort on Windows NTFS).
 * 3. Cleans up temp file on failure.
 *
 * @param filePath - Target file path
 * @param data - String content to write
 * @param encoding - File encoding (default: utf-8)
 */
export function atomicWriteFileSync(filePath: string, data: string, encoding: BufferEncoding = 'utf-8'): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpSuffix = randomBytes(6).toString('hex');
  const tmpPath = join(dir, `.tmp-${tmpSuffix}`);

  try {
    writeFileSync(tmpPath, data, encoding);
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { }
    throw err;
  }
}
