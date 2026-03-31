import { createPublicKey, verify as nodeVerify } from "crypto";
import type { EpistemicBlock } from "./types.js";

function base64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function jwkToKeyObject(jwk: JsonWebKey) {
  return createPublicKey({ key: jwk as any, format: "jwk" });
}

export async function fetchJwks(jwksUrl: string): Promise<JsonWebKey[]> {
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { keys?: JsonWebKey[] };
  if (!body || !Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error("JWKS response did not contain any keys");
  }

  return body.keys;
}

export function verifyJwtEdDsa(jwt: string, jwk: JsonWebKey): boolean {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT must have three dot-separated parts");
  }

  const [header, payload, signature] = parts;
  const signingInput = Buffer.from(`${header}.${payload}`, "utf-8");
  const sig = base64UrlToBuffer(signature);
  const publicKey = jwkToKeyObject(jwk);

  return nodeVerify(null, signingInput, publicKey, sig);
}

export async function verifyBlockJwt(
  block: EpistemicBlock,
  jwks?: JsonWebKey[]
): Promise<{ ok: boolean; keyCount: number }> {
  if (!block.attestation.jwt) {
    throw new Error("Block does not contain attestation.jwt");
  }

  const keys = jwks ?? (block.metadata.jwks_url ? await fetchJwks(block.metadata.jwks_url) : null);
  if (!keys || keys.length === 0) {
    throw new Error("No JWKS available to verify block JWT");
  }

  for (const key of keys) {
    try {
      if (verifyJwtEdDsa(block.attestation.jwt, key)) {
        return { ok: true, keyCount: keys.length };
      }
    } catch {
      // try next key
    }
  }

  return { ok: false, keyCount: keys.length };
}
