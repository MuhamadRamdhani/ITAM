/**
 * Input Validation Utilities
 * Centralized validation for common input patterns
 * Prevents injection attacks, invalid data, etc.
 */

// Regex patterns for common fields
const PATTERNS = {
  // Email: basic RFC 5322 subset
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // URL-safe characters only (no spaces, special chars)
  SLUG: /^[a-z0-9_-]+$/i,

  // Alphanumeric + spaces, underscores, hyphens (names, titles)
  NAME: /^[a-zA-Z0-9\s_-]+$/,

  // Numeric only
  NUMERIC: /^\d+$/,

  // Phone number (basic: digits, +, -, spaces)
  PHONE: /^[\d\s\-\+\(\)]+$/,

  // ISO 8601 date
  ISO_DATE: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/,
};

/**
 * Sanitize string input
 * - Trim whitespace
 * - Remove null bytes
 * - Limit length
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== "string") return "";

  return input
    .trim()
    .replace(/\0/g, "") // Remove null bytes
    .slice(0, maxLength);
}

/**
 * Validate email address
 */
export function validateEmail(email) {
  const sanitized = sanitizeString(email, 255);
  if (!sanitized) return { valid: false, error: "Email required" };
  if (!PATTERNS.EMAIL.test(sanitized)) {
    return { valid: false, error: "Invalid email format" };
  }
  if (sanitized.length > 254) {
    return { valid: false, error: "Email too long (max 254 chars)" };
  }
  return { valid: true, value: sanitized };
}

/**
 * Validate username/identifier
 * Alphanumeric, underscore, hyphen only
 */
export function validateUsername(username) {
  const sanitized = sanitizeString(username, 50);
  if (!sanitized) return { valid: false, error: "Username required" };
  if (sanitized.length < 3) {
    return { valid: false, error: "Username min 3 characters" };
  }
  if (!PATTERNS.SLUG.test(sanitized)) {
    return {
      valid: false,
      error: "Username must be alphanumeric, underscore, or hyphen",
    };
  }
  return { valid: true, value: sanitized };
}

/**
 * Validate password strength
 */
export function validatePassword(password) {
  if (typeof password !== "string") {
    return { valid: false, error: "Password required" };
  }

  if (password.length < 8) {
    return { valid: false, error: "Password min 8 characters" };
  }
  if (password.length > 128) {
    return { valid: false, error: "Password max 128 characters" };
  }

  // Check for at least 1 uppercase, 1 lowercase, 1 number, 1 special
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    return {
      valid: false,
      error:
        "Password must contain uppercase, lowercase, number, and special character",
    };
  }

  return { valid: true, value: password };
}

/**
 * Validate name field (first name, last name, etc.)
 */
export function validateName(name, fieldName = "Name") {
  const sanitized = sanitizeString(name, 100);
  if (!sanitized) return { valid: false, error: `${fieldName} required` };
  if (sanitized.length < 2) {
    return { valid: false, error: `${fieldName} min 2 characters` };
  }
  if (!PATTERNS.NAME.test(sanitized)) {
    return {
      valid: false,
      error: `${fieldName} must contain only letters, numbers, spaces, hyphens, and underscores`,
    };
  }
  return { valid: true, value: sanitized };
}

/**
 * Validate code field (code, status_code, etc.)
 */
export function validateCode(code, fieldName = "Code") {
  const sanitized = sanitizeString(code, 50).toUpperCase();
  if (!sanitized) return { valid: false, error: `${fieldName} required` };
  if (!/^[A-Z0-9_]+$/.test(sanitized)) {
    return {
      valid: false,
      error: `${fieldName} must be uppercase alphanumeric or underscore`,
    };
  }
  return { valid: true, value: sanitized };
}

/**
 * Validate numeric ID
 */
export function validateId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    return { valid: false, error: "Invalid ID (must be positive integer)" };
  }
  return { valid: true, value: n };
}

/**
 * Validate integer with range
 */
export function validateInteger(value, fieldName = "Value", { min, max } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { valid: false, error: `${fieldName} must be integer` };
  }
  if (min !== undefined && n < min) {
    return { valid: false, error: `${fieldName} must be >= ${min}` };
  }
  if (max !== undefined && n > max) {
    return { valid: false, error: `${fieldName} must be <= ${max}` };
  }
  return { valid: true, value: n };
}

/**
 * Validate enum value
 */
export function validateEnum(value, allowedValues, fieldName = "Value") {
  const sanitized = sanitizeString(value, 100).toUpperCase();
  if (!sanitized) return { valid: false, error: `${fieldName} required` };
  if (!allowedValues.includes(sanitized)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${allowedValues.join(", ")}`,
    };
  }
  return { valid: true, value: sanitized };
}

/**
 * Validate URL
 */
export function validateUrl(url) {
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "URL must use http or https" };
    }
    return { valid: true, value: parsed.toString() };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Validate UUID v4
 */
export function validateUUID(uuid) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    return { valid: false, error: "Invalid UUID format" };
  }
  return { valid: true, value: uuid.toLowerCase() };
}

/**
 * Validate ISO 8601 date
 */
export function validateISODate(dateStr) {
  if (!PATTERNS.ISO_DATE.test(dateStr)) {
    return { valid: false, error: "Invalid ISO 8601 date format" };
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    return { valid: false, error: "Invalid date value" };
  }
  return { valid: true, value: d.toISOString() };
}

/**
 * Batch validation helper
 * @param {Object} data - Data to validate
 * @param {Object} schema - { fieldName: { validator, required?: bool } }
 */
export function validateBatch(data, schema) {
  const errors = {};
  const valid = {};

  for (const [field, config] of Object.entries(schema)) {
    const value = data[field];

    if (config.required && !value) {
      errors[field] = `${field} is required`;
      continue;
    }

    if (!value && !config.required) {
      continue;
    }

    const result = config.validator(value);
    if (!result.valid) {
      errors[field] = result.error;
    } else {
      valid[field] = result.value;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: valid,
  };
}
