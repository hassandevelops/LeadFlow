import argon2 from "argon2";

const HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

let dummyHashPromise: Promise<string> | null = null;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

export async function equalizeVerifyTiming(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("leadflow-dummy-password");
  await verifyPassword(await dummyHashPromise, password);
}
