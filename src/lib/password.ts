/**
 * Password hashing for the one credential this app has.
 *
 * Deliberately *not* `server-only`: `scripts/admin-password.ts` has to produce a
 * hash from a plain Node process, and `src/lib/auth.ts` has to verify one from
 * a server action. Both need the same parameters, and the one way to guarantee
 * that is for both to import the same module. A second copy of the cost
 * constants is a hash that silently stops matching.
 *
 * scrypt from `node:crypto` rather than argon2 or bcrypt: no native build, no
 * new dependency, and nothing to go wrong in a Docker image that is already
 * doing enough. The cost below is the recommended interactive setting: tens of
 * milliseconds per attempt, which is the point — it is what makes a stolen hash
 * expensive to attack offline and an online guess slow.
 */
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// Cast, because `promisify` picks the three-argument overload and loses the one
// that takes the cost parameters — which are the whole point of using scrypt.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** 2^14. 128 * N * r = 16MB, comfortably under Node's 32MB default maxmem. */
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * `scrypt.N.r.p.salt.key`, all base64url.
 *
 * The parameters travel with the hash so that raising the cost later still
 * verifies every hash minted under the old one. A format that hard-codes the
 * cost means nobody can ever raise it without locking the admin out.
 *
 * Separated by `.` and not the conventional `$`, which cost an afternoon.
 * Next.js expands `$NAME` references inside .env values, and base64url's
 * alphabet includes `_`, so a key beginning with a letter made the tail of the
 * hash a variable reference and Next quietly replaced it with nothing. The
 * result parsed, had an empty key, and failed every sign-in in two
 * milliseconds. A `.` means nothing to Next's loader, to dotenv or to a shell,
 * and nothing in the base64url alphabet can be mistaken for a separator.
 */
const SEPARATOR = ".";
const PREFIX = "scrypt";

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  });

  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(SEPARATOR);
}

/**
 * True when `plain` produced `stored`.
 *
 * Returns false rather than throwing on a malformed or truncated hash: this is
 * fed straight from an environment variable that somebody pasted into a host's
 * dashboard, and a hash with a line break in it must fail a sign-in, not take
 * the login page down with a 500.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(SEPARATOR);
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // A hash claiming an absurd cost would otherwise let a pasted string pin the
  // instance's CPU and memory on every sign-in attempt.
  if (N < 1024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(rawSalt, "base64url");
    expected = Buffer.from(rawKey, "base64url");
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
    });
  } catch {
    // scrypt rejects parameter combinations that exceed maxmem.
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Why a stored hash can never match, or null if it looks usable.
 *
 * `verifyPassword` deliberately returns false on a malformed hash rather than
 * throwing, which is right for the request but leaves an operator staring at
 * "that email address and password don't match" with a correct password. This
 * is logged at sign-in so the environment variable gets blamed out loud.
 *
 * Written after an .env value lost its tail to `$NAME` expansion — see the note
 * on SEPARATOR. The empty-key case below is exactly that failure.
 */
export function describeHashProblem(stored: string): string | null {
  const trimmed = stored.trim();
  if (!trimmed) return "it is empty";

  const parts = trimmed.split(SEPARATOR);
  if (parts[0] !== PREFIX) {
    return `it does not start with "${PREFIX}${SEPARATOR}" — regenerate it with: npm run admin:password`;
  }
  if (parts.length !== 6) {
    return `it has ${parts.length} "${SEPARATOR}"-separated fields, not 6 — it looks truncated or mangled`;
  }
  if (!parts[4] || !parts[5]) {
    return "its salt or key field is empty — something expanded or truncated the value";
  }
  return null;
}

/**
 * Burns the same CPU a real verification would, for the branch with no account.
 *
 * An unknown address that comes back instantly while a real admin's pays for a
 * hash tells anyone with a stopwatch which addresses are admins — the same thing the
 * magic-link form goes out of its way not to reveal. Calling this on every path
 * that fails before it reaches a hash makes them all cost the same.
 *
 * The dummy hash is built once, on first use rather than at import: a top-level
 * await here would make every module that touches sign-in pay for a hash before
 * it could initialise, including ones that never check a password.
 */
let dummyHash: Promise<string> | null = null;

export async function burnVerification(plain: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  await verifyPassword(plain, await dummyHash);
  return false;
}
