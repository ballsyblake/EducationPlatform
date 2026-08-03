import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

export const MIN_PASSWORD_LENGTH = 10;

/** Words that read clearly over the phone and can't be confused for each other. */
const WORDS = [
  "blitz", "wedge", "audible", "gauntlet", "sideline", "playbook", "huddle", "counter",
  "boot", "trap", "sweep", "dive", "flood", "wheel", "corner", "seam",
  "anchor", "hammer", "rocket", "thunder", "granite", "compass", "lantern", "harbor",
];

/**
 * Hashes with scrypt from the standard library — no bcrypt dependency, and no
 * native module to compile on whatever host this ends up on.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return [PREFIX, salt.toString("hex"), derived.toString("hex")].join(":");
}

/** Constant-time verification. False for any malformed or missing hash. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const [prefix, saltHex, hashHex] = stored.split(":");
  if (prefix !== PREFIX || !saltHex || !hashHex) return false;

  try {
    const derived = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
    const expected = Buffer.from(hashHex, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * A temporary password an admin can read aloud or text to a coach.
 * Two words plus digits clears the length rule while staying easy to type.
 */
export function generateTempPassword(): string {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${pick()}-${digits}`;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) {
    return "That password is too long.";
  }
  if (!/[^\s]/.test(password)) {
    return "Enter a password.";
  }
  return null;
}
