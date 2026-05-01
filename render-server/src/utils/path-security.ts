import path from "path";
import fs from "fs";

/**
 * Utility functions for secure path operations.
 * Prevents path traversal attacks and ensures files stay within intended directories.
 */

export function safeResolvePath(baseDir: string, filename: string): string | null {
  try {
    const sanitizedFilename = path.basename(filename);
    if (!/^[a-zA-Z0-9._-]+$/.test(sanitizedFilename)) {
      return null;
    }
    const resolvedPath = path.resolve(baseDir, sanitizedFilename);
    const baseDirResolved = path.resolve(baseDir);
    if (!resolvedPath.startsWith(baseDirResolved) || resolvedPath === baseDirResolved) {
      return null;
    }
    return resolvedPath;
  } catch {
    return null;
  }
}

export function safeResolveOutPath(filename: string): string | null {
  return safeResolvePath("out", filename);
}

export function isValidFilename(filename: string): boolean {
  try {
    const sanitizedFilename = path.basename(filename);
    return /^[a-zA-Z0-9._-]+$/.test(sanitizedFilename);
  } catch {
    return false;
  }
}

export function sanitizeFilename(filename: string): string | null {
  try {
    const sanitized = path.basename(filename);
    const cleaned = sanitized.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!cleaned || cleaned.length < 1) return null;
    return cleaned;
  } catch {
    return null;
  }
}

export function createSafeFilename(originalName: string, suffix?: string): string {
  const timestamp = Date.now();
  const extension = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, extension);
  const sanitizedBase = sanitizeFilename(nameWithoutExt) || "file";
  const sanitizedSuffix = suffix ? sanitizeFilename(suffix) || "" : "";
  const parts = [sanitizedBase];
  if (sanitizedSuffix) parts.push(sanitizedSuffix);
  parts.push(timestamp.toString());
  return `${parts.join("_")}${extension}`;
}

export function ensureDirectoryExists(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}
