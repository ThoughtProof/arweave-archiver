#!/usr/bin/env tsx
/**
 * Demo: Archive an Epistemic Block to Arweave
 *
 * Usage:
 *   npm run demo          # Live upload to Arweave
 *   npm run demo:dry      # Dry run — shows what would be uploaded
 */

import { ThoughtProofArchiver } from "./archiver.js";
import type { EpistemicBlock } from "./types.js";
import { createHash } from "crypto";

const DRY_RUN = process.argv.includes("--dry-run");

/** Sample Epistemic Block (standard verification, 5 models) */
const sampleBlock: EpistemicBlock = {
  version: "1.0",
  type: "epistemic-block",
  id: `eb-${Date.now()}-${createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 8)}`,
  claim: {
    text: "Approve €500 payment to vendor-42 based on invoice analysis and 3-year payment history showing 98.7% on-time delivery rate",
    source: "agent-0xAbDdE1A06eEBD934fea35D4385cF68F43aCc986d",
    submitted_at: new Date().toISOString(),
    domain: "financial",
    stakeLevel: "high",
  },
  verification: {
    verdict: "ALLOW",
    confidence: 0.87,
    model_consensus: {
      allow_models: 4,
      block_models: 0,
      uncertain_models: 1,
      total_models: 5,
    },
    dissent: [
      "Vendor payment history is strong, but current invoice amount exceeds 90th percentile of historical payments — recommend manual review threshold",
    ],
    model_verdicts: [
      {
        model: "claude-sonnet-4-20250514",
        verdict: "ALLOW",
        confidence: 0.91,
        reasoning:
          "Invoice matches PO #4872, vendor has clean 3-year track record, amount within contractual limits. The 98.7% delivery rate indicates high reliability.",
      },
      {
        model: "grok-3",
        verdict: "ALLOW",
        confidence: 0.85,
        reasoning:
          "Cross-referenced invoice details with vendor database. All line items match agreed pricing. Currency and routing details verified against known vendor bank info.",
      },
      {
        model: "deepseek-r1",
        verdict: "UNCERTAIN",
        confidence: 0.52,
        reasoning:
          "While vendor history is positive, the €500 amount is 2.3 standard deviations above the mean transaction value of €187. Recommend flagging for human review despite overall approval signals.",
      },
      {
        model: "claude-opus-4-20250514",
        verdict: "ALLOW",
        confidence: 0.89,
        reasoning:
          "Comprehensive verification passed. Invoice authenticity confirmed via digital signature. Payment routing validated against SEPA directory. No anomaly indicators.",
      },
      {
        model: "grok-3-mini",
        verdict: "ALLOW",
        confidence: 0.83,
        reasoning:
          "Vendor verified, amount within limits, payment history supports approval. Standard risk assessment: LOW.",
      },
    ],
  },
  pipeline: {
    stages: [
      "normalize",
      "generate",
      "adversarial_critique",
      "synthesize",
      "attestation",
    ],
    model_diversity_index: 0.85,
    synthesis_audit_score: 0.91,
    speed: "standard",
    durationMs: 3847,
    cost_usd: 0.02,
  },
  attestation: {
    receiptId: `rcpt_${createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 20)}`,
    signer: "0xAbDdE1A06eEBD934fea35D4385cF68F43aCc986d",
    algorithm: "EdDSA",
    jwt: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0aG91Z2h0cHJvb2YuYWkiLCJ2ZXJkaWN0IjoiQUxMT1ciLCJjb25maWRlbmNlIjowLjg3fQ.mock-signature-for-demo",
    blockHash:
      "0x" +
      createHash("sha256").update(String(Date.now())).digest("hex"),
    hash_chain_parent: `eb-${Date.now() - 86400000}-prev`,
    timestamp: Math.floor(Date.now() / 1000),
  },
  metadata: {
    agent_id: "erc8004-28388",
    protocol: "ERC-8183",
    cost_usd: 0.02,
    provider: "thoughtproof",
    api_version: "1.3.7",
    verifyUrl: "https://api.thoughtproof.ai/v1/receipts/",
    jwks_url: "https://api.thoughtproof.ai/.well-known/jwks.json",
  },
};

async function main() {
  const blockJson = JSON.stringify(sampleBlock, null, 2);
  const blockSize = Buffer.byteLength(JSON.stringify(sampleBlock), "utf-8");

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   ThoughtProof × ar.io — Arweave Archiver Demo  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log(`📦 Epistemic Block: ${sampleBlock.id}`);
  console.log(`   Verdict:    ${sampleBlock.verification.verdict} (${sampleBlock.verification.confidence})`);
  console.log(`   Models:     ${sampleBlock.verification.model_consensus.total_models}`);
  console.log(`   Domain:     ${sampleBlock.claim.domain}`);
  console.log(`   Stake:      ${sampleBlock.claim.stakeLevel}`);
  console.log(`   Size:       ${blockSize} bytes (${(blockSize / 1024).toFixed(2)} KB)\n`);

  if (DRY_RUN) {
    console.log("🏜️  DRY RUN — showing what would be uploaded:\n");
    console.log("Tags:");
    const { buildTags } = await import("./archiver.js");
    const tags = buildTags(sampleBlock, "0x7890abcd1234ef5678");
    for (const tag of tags) {
      console.log(`   ${tag.name}: ${tag.value}`);
    }
    const tagBytes = tags.reduce(
      (sum, t) => sum + t.name.length + t.value.length,
      0
    );
    console.log(`\n   Tag budget: ${tagBytes} / 4,096 bytes used`);
    console.log("\nFull block JSON:");
    console.log(blockJson);
    console.log("\n✅ Dry run complete. Run `npm run demo` for live upload.");
    return;
  }

  // Live upload
  console.log("🚀 Uploading to Arweave...\n");

  const archiver = new ThoughtProofArchiver({
    walletPath: "./wallet.json",
    verbose: true,
  });

  await archiver.init();
  const result = await archiver.archive(sampleBlock, "0x7890abcd1234ef5678");

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                  ARCHIVE RESULT                  ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ Arweave TX:  ${result.arweaveId}`);
  console.log(`║ Gateway:     ${result.gatewayUrl}`);
  console.log(`║ Size:        ${result.sizeBytes} bytes`);
  console.log(`║ Cost:        ${result.cost} winc`);
  console.log(`║ Archived at: ${result.archivedAt}`);
  console.log("╚══════════════════════════════════════════════════╝");

  console.log("\n🔍 Verify with:");
  console.log(`   curl ${result.gatewayUrl}`);
  console.log(`   npm run verify -- ${result.arweaveId}`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
