import fs from "node:fs";
import path from "node:path";

/**
 * File Type Security Configuration
 * Whitelist of allowed file types for evidence uploads
 */
export const ALLOWED_FILE_TYPES = {
  // Documents
  "application/pdf": {
    ext: ".pdf",
    name: "PDF Document",
    maxSizeMB: 50,
  },
  "application/msword": {
    ext: ".doc",
    name: "Word Document",
    maxSizeMB: 25,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: ".docx",
    name: "Word Document",
    maxSizeMB: 25,
  },
  "application/vnd.ms-excel": {
    ext: ".xls",
    name: "Excel Spreadsheet",
    maxSizeMB: 25,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: ".xlsx",
    name: "Excel Spreadsheet",
    maxSizeMB: 25,
  },
  "application/vnd.ms-powerpoint": {
    ext: ".ppt",
    name: "PowerPoint Presentation",
    maxSizeMB: 50,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: ".pptx",
    name: "PowerPoint Presentation",
    maxSizeMB: 50,
  },

  // Images
  "image/jpeg": {
    ext: ".jpg",
    name: "JPEG Image",
    maxSizeMB: 25,
  },
  "image/png": {
    ext: ".png",
    name: "PNG Image",
    maxSizeMB: 25,
  },
  "image/gif": {
    ext: ".gif",
    name: "GIF Image",
    maxSizeMB: 25,
  },
  "image/webp": {
    ext: ".webp",
    name: "WebP Image",
    maxSizeMB: 25,
  },

  // Text
  "text/plain": {
    ext: ".txt",
    name: "Text File",
    maxSizeMB: 10,
  },
  "text/csv": {
    ext: ".csv",
    name: "CSV File",
    maxSizeMB: 25,
  },

  // Archives
  "application/zip": {
    ext: ".zip",
    name: "ZIP Archive",
    maxSizeMB: 100,
  },
  "application/x-rar-compressed": {
    ext: ".rar",
    name: "RAR Archive",
    maxSizeMB: 100,
  },
  "application/gzip": {
    ext: ".gz",
    name: "GZIP Archive",
    maxSizeMB: 100,
  },
};

/**
 * Magic bytes (file signatures) for detecting actual file types
 * This prevents MIME type spoofing by checking file content
 */
const MAGIC_BYTES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  gif: [0x47, 0x49, 0x46], // GIF
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF....WEBP
  zip: [0x50, 0x4b, 0x03, 0x04], // PK
  rar: [0x52, 0x61, 0x72, 0x21], // Rar!
  gzip: [0x1f, 0x8b],
  docx: [0x50, 0x4b, 0x03, 0x04], // PKZip (same as ZIP)
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  pptx: [0x50, 0x4b, 0x03, 0x04],
};

/**
 * Detect actual file type from magic bytes
 * @param {Buffer} buffer - First bytes of file
 * @returns {string|null} - Detected MIME type or null
 */
export function detectFileTypeFromMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // PDF
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // GIF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return "image/gif";
  }

  // WEBP (RIFF container with WEBP signature at offset 8)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // ZIP (includes DOCX, XLSX, PPTX)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "application/zip";
  }

  // RAR
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x61 &&
    buffer[2] === 0x72 &&
    buffer[3] === 0x21
  ) {
    return "application/x-rar-compressed";
  }

  // GZIP
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return "application/gzip";
  }

  return null;
}

/**
 * Validate file upload
 * @param {Object} opts - { filename, mimetype, sizeBytes }
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateFileUpload(opts) {
  const { filename, mimetype, sizeBytes, detectedMimeType } = opts;

  // 1. Check MIME type is whitelisted
  const actualMimeType = detectedMimeType || mimetype;
  if (!ALLOWED_FILE_TYPES[actualMimeType]) {
    return {
      valid: false,
      error: `File type "${actualMimeType}" is not allowed. Allowed types: ${Object.keys(ALLOWED_FILE_TYPES).join(", ")}`,
      code: "INVALID_FILE_TYPE",
    };
  }

  // 2. Check file size
  const maxSizeMB = ALLOWED_FILE_TYPES[actualMimeType].maxSizeMB;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (sizeBytes > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds limit of ${maxSizeMB}MB (got ${Math.round(sizeBytes / 1024 / 1024)}MB)`,
      code: "FILE_TOO_LARGE",
    };
  }

  // 3. Check for dangerous extensions (if extension differs from expected)
  const ext = path.extname(filename).toLowerCase();
  const expectedExts = Object.values(ALLOWED_FILE_TYPES)
    .filter((t) => t.ext === ext)
    .map((t) => t.name);

  const dangerousExts = [".exe", ".bat", ".cmd", ".com", ".sh", ".py", ".rb", ".jar"];
  if (dangerousExts.includes(ext)) {
    return {
      valid: false,
      error: `Executable files are not allowed`,
      code: "DANGEROUS_FILE_TYPE",
    };
  }

  return { valid: true };
}

/**
 * Check if file is suspicious based on content
 * @param {Buffer} buffer - First chunk of file (at least 512 bytes)
 * @returns {Object} - { suspicious: boolean, reason?: string }
 */
export function checkFileSuspicious(buffer) {
  if (!buffer || buffer.length === 0) {
    return { suspicious: true, reason: "Empty file" };
  }

  // Check for null bytes in first 1KB (sign of binary/executable)
  const headerSize = Math.min(1024, buffer.length);
  const header = buffer.slice(0, headerSize).toString("latin1");

  // Null bytes are suspicious (could be obfuscated executable)
  if (header.includes("\0")) {
    // Allow known binary formats
    const mimeDetected = detectFileTypeFromMagicBytes(buffer);
    const allowedBinary = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/zip",
    ];
    if (!allowedBinary.includes(mimeDetected)) {
      return {
        suspicious: true,
        reason: "File contains suspicious binary content (null bytes)",
      };
    }
  }

  return { suspicious: false };
}

/**
 * Check if directory path is safe (prevent path traversal)
 * @param {string} basePath - Base directory
 * @param {string} filePath - Requested file path
 * @returns {boolean} - True if safe
 */
export function isSafeFilePath(basePath, filePath) {
  const resolved = path.resolve(filePath);
  const base = path.resolve(basePath);
  return resolved.startsWith(base);
}

/**
 * Check if file exists and is accessible
 * @param {string} filePath - Path to check
 * @returns {boolean}
 */
export async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
