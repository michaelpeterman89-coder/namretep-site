export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 8;

/** Returns an error message, or null if the username is valid. */
export function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 20) return "Username must be 3–20 characters.";
  if (!USERNAME_PATTERN.test(username)) return "Use only letters, numbers, and underscores.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

/**
 * Only allow redirects to paths on this site (e.g. "/profile"), never to
 * another domain like "//evil.example".
 */
export function safeRedirectPath(value: unknown, fallback = "/profile"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
