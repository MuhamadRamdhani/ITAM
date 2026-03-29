/**
 * Simple in-memory rate limiter for file uploads
 * Tracks uploads per user/IP
 */

const uploadAttempts = new Map();

/**
 * Rate limiter configuration
 */
export const RATE_LIMIT_CONFIG = {
  // Max uploads per user per hour
  maxUploadsPerHour: 50,
  // Max uploads per IP per hour
  maxUploadsPerIPPerHour: 100,
  // Max total upload size per user per hour (in MB)
  maxUploadSizePerHourMB: 1000,
};

/**
 * Cleanup old entries every 5 minutes
 */
function cleanupOldEntries() {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  for (const [key, entries] of uploadAttempts.entries()) {
    const filtered = entries.filter((entry) => entry.timestamp > oneHourAgo);
    if (filtered.length === 0) {
      uploadAttempts.delete(key);
    } else if (filtered.length < entries.length) {
      uploadAttempts.set(key, filtered);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldEntries, 5 * 60 * 1000);

/**
 * Check if upload should be rate limited
 * @param {Object} opts - { userId, userIp, fileSizeMB }
 * @returns {Object} - { allowed: boolean, reason?: string, retryAfterSeconds?: number }
 */
export function checkUploadRateLimit(opts) {
  const { userId, userIp, fileSizeMB } = opts;
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // Check user-based rate limit
  if (userId) {
    const userKey = `user:${userId}`;
    const userEntries = uploadAttempts.get(userKey) || [];

    // Filter to last hour
    const recentUploads = userEntries.filter((e) => e.timestamp > oneHourAgo);

    // Check upload count
    if (recentUploads.length >= RATE_LIMIT_CONFIG.maxUploadsPerHour) {
      const oldestUpload = Math.min(...recentUploads.map((e) => e.timestamp));
      const retryAfterSeconds = Math.ceil(
        (oldestUpload + 60 * 60 * 1000 - now) / 1000
      );

      return {
        allowed: false,
        reason: `Rate limit exceeded: max ${RATE_LIMIT_CONFIG.maxUploadsPerHour} uploads per hour`,
        code: "UPLOAD_RATE_LIMIT",
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    // Check total upload size
    const totalSizeMB = recentUploads.reduce((sum, e) => sum + e.fileSizeMB, 0);
    if (totalSizeMB + fileSizeMB > RATE_LIMIT_CONFIG.maxUploadSizePerHourMB) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: max ${RATE_LIMIT_CONFIG.maxUploadSizePerHourMB}MB per hour (used ${Math.round(totalSizeMB)}MB)`,
        code: "UPLOAD_SIZE_LIMIT",
      };
    }

    // Record this upload
    recentUploads.push({ timestamp: now, fileSizeMB });
    uploadAttempts.set(userKey, recentUploads);
  }

  // Check IP-based rate limit
  if (userIp) {
    const ipKey = `ip:${userIp}`;
    const ipEntries = uploadAttempts.get(ipKey) || [];

    // Filter to last hour
    const recentUploads = ipEntries.filter((e) => e.timestamp > oneHourAgo);

    // Check upload count
    if (recentUploads.length >= RATE_LIMIT_CONFIG.maxUploadsPerIPPerHour) {
      const oldestUpload = Math.min(...recentUploads.map((e) => e.timestamp));
      const retryAfterSeconds = Math.ceil(
        (oldestUpload + 60 * 60 * 1000 - now) / 1000
      );

      return {
        allowed: false,
        reason: `Rate limit exceeded: max ${RATE_LIMIT_CONFIG.maxUploadsPerIPPerHour} uploads per hour per IP`,
        code: "UPLOAD_RATE_LIMIT_IP",
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    // Record this upload
    recentUploads.push({ timestamp: now, fileSizeMB });
    uploadAttempts.set(ipKey, recentUploads);
  }

  return { allowed: true };
}
