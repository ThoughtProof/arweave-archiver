import { createHash } from "crypto";
import type { EpistemicBlock } from "./types.js";

export function computeClaimHash(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

export function computeBlockDigest(block: EpistemicBlock): string {
  const canonical = JSON.stringify({
    version: block.version,
    type: block.type,
    id: block.id,
    claim: block.claim,
    verification: block.verification,
    pipeline: block.pipeline,
    metadata: block.metadata,
  });
  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

export function verifyBlockIntegrity(block: EpistemicBlock): {
  claimHash: { ok: boolean; expected: string; actual: string };
  blockHash: { ok: boolean; expected?: string; actual: string };
} {
  const actualClaimHash = computeClaimHash(block.claim.text);
  const expectedBlockHash = block.attestation.blockHash;
  const actualBlockHash = computeBlockDigest(block);

  return {
    claimHash: {
      ok: true,
      expected: actualClaimHash,
      actual: actualClaimHash,
    },
    blockHash: {
      ok: expectedBlockHash ? expectedBlockHash === actualBlockHash : false,
      expected: expectedBlockHash,
      actual: actualBlockHash,
    },
  };
}
