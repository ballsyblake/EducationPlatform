/**
 * Turns a password into the hash that goes in ADMIN_PASSWORD_HASH.
 *
 *   npm run admin:password
 *
 * Reads the password from stdin, not from an argument, so it never lands in a
 * shell history file. Prints the hash, which is the only thing that leaves this
 * process — paste it into the host's dashboard and the plaintext stays on the
 * machine you typed it on.
 *
 * This replaces `ADMIN_LINK=print` as the way into a fresh or locked-out
 * deployment. That wrote a working sign-in token into the deploy log; this
 * writes a scrypt hash into an environment variable, which is readable by the
 * same people and worth nothing to them.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/lib/password.ts";

/** Short enough and it doesn't matter how good the hashing is. */
const MIN_LENGTH = 12;

async function read(prompt: string) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  try {
    // No masking. `readline` cannot hide typing without taking over the TTY,
    // and a half-working mask that leaks the password on one terminal is worse
    // than one that was never promised. Nothing is echoed when stdin is a pipe.
    if (stdin.isTTY) {
      console.log("Your typing will be visible. Clear the screen afterwards.\n");
    }
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const password = await read("Admin password: ");

  if (password.length < MIN_LENGTH) {
    console.error(`\nToo short — use at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }

  // Only asked for interactively. Piping the password in is a deliberate act and
  // a second prompt would just hang waiting for input that isn't coming.
  if (stdin.isTTY) {
    const again = await read("Again: ");
    if (again !== password) {
      console.error("\nThey don't match. Nothing was written.");
      process.exit(1);
    }
  }

  const hash = await hashPassword(password);

  console.log("\nSet this in your host's environment (Render → Environment):\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  console.log("Then remove ADMIN_LINK, and sign in at /login with an ADMIN_EMAILS address.");
  console.log("The hash is safe to paste into a dashboard. The password is not — it is");
  console.log("nowhere but in your head and this terminal's scrollback.");
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
