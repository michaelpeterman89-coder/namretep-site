/** Returns a whole number from 0 up to (but not including) maxExclusive. */
export type RandomInt = (maxExclusive: number) => number;

const RANGE = 2 ** 32;

/**
 * Cryptographically secure random integer. Uses rejection sampling so every
 * result is exactly equally likely (plain `x % max` would slightly favor
 * small numbers).
 */
export const secureRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > RANGE) {
    throw new RangeError(`maxExclusive must be an integer from 1 to 2^32, got ${maxExclusive}`);
  }
  const limit = RANGE - (RANGE % maxExclusive);
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
};

/** Fisher–Yates shuffle. Returns a new array; the input is not changed. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt = secureRandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
