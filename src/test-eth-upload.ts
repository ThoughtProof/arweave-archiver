#!/usr/bin/env tsx
/**
 * Live test: Ethereum wallet auth + upload to Arweave via Turbo SDK
 *
 * Usage:
 *   ETH_KEY=0x... npx tsx src/test-eth-upload.ts
 *   npx tsx src/test-eth-upload.ts --generate   # Generate fresh test key
 */

import { ThoughtProofArchiver } from "./archiver.js";
import type { EpistemicBlock } from "./types.js";
import { createHash, randomBytes } from "crypto";

const GENERATE = process.argv.includes("--generate");

async function generateTestKey(): Promise<string> {
  // Generate a random 32-byte private key (0x-prefixed)
  const key = "0x" + randomBytes(32).toString("hex");
  console.log("🔑 Generated fresh Ethereum test key");
  console.log(`   Key: ${key.slice(0, 10)}...${key.slice(-6)}`);
  return key;
}

async function main() {
  let ethKey = process.env.ETH_KEY;

  if (!ethKey && GENERATE) {
    ethKey = await generateTestKey();
  }

  if (!ethKey) {
    console.error("Usage:");
    console.error("  ETH_KEY=0x... npx tsx src/test-eth-upload.ts");
    console.error("  npx tsx src/test-eth-upload.ts --generate");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Ethereum Wallet → Turbo SDK → Arweave — TEST   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Test 1: Auth with Ethereum key, token: ethereum
  const tokens = ["ethereum", "base-eth"] as const;

  for (const token of tokens) {
    console.log(`\n--- Testing token: ${token} ---`);

    try {
      const archiver = new ThoughtProofArchiver({
        ethereumKey: ethKey,
        token: token,
        verbose: true,
      });

      await archiver.init();
      console.log(`✅ Auth with ${token}: SUCCESS\n`);

      // Try a small upload
      const testBlock: EpistemicBlock = {
        version: "1.0",
        type: "epistemic-block",
        id: `eb-test-${token}-${Date.now()}`,
        claim: {
          text: "Test claim for Ethereum wallet upload validation",
          source: "agent-0xTestEthWallet",
          submitted_at: new Date().toISOString(),
          domain: "general",
          stakeLevel: "low",
        },
        verification: {
          verdict: "ALLOW",
          confidence: 0.95,
          model_consensus: {
            allow_models: 3,
            block_models: 0,
            uncertain_models: 0,
            total_models: 3,
          },
          dissent: [],
        },
        pipeline: {
          stages: ["normalize", "generate", "synthesize"],
          model_diversity_index: 0.8,
          synthesis_audit_score: 0.9,
          speed: "fast",
          durationMs: 1200,
          cost_usd: 0.008,
        },
        attestation: {
          signer: "0xTestEthWalletSigner",
          hash_chain_parent: "eb-genesis",
          timestamp: Math.floor(Date.now() / 1000),
        },
        metadata: {
          agent_id: "erc8004-28388",
          protocol: "ERC-8183",
          provider: "thoughtproof",
          api_version: "1.3.7",
        },
      };

      const result = await archiver.archive(testBlock);
      console.log(`✅ Upload with ${token}: SUCCESS`);
      console.log(`   TX: ${result.arweaveId}`);
      console.log(`   URL: ${result.gatewayUrl}`);
      console.log(`   Cost: ${result.cost} winc`);
      console.log(`   Size: ${result.sizeBytes} bytes`);
    } catch (err: any) {
      console.log(`❌ ${token}: ${err.message}`);
      // Show more detail for debugging
      if (err.cause) {
        console.log(`   Cause: ${err.cause.message}`);
      }
    }
  }

  console.log("\n--- Done ---");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
