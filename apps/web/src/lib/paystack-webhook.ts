import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function paystackEventReference(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function verifyPaystackSignature(rawBody: string, signature: string, secretKey: string) {
  if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const provided = Buffer.from(signature, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
