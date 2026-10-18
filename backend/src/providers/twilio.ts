import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => accumulator + key + params[key], url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const expected = twilioSignature(input.authToken, input.url, input.params);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(input.signature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
