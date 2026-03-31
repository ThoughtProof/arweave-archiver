#!/usr/bin/env tsx
/**
 * Verify and retrieve an archived Epistemic Block from Arweave.
 *
 * Usage:
 *   npm run verify -- <arweave-tx-id>
 *   npm run verify -- --query              # List all ThoughtProof blocks
 *   npm run verify -- --query --verdict BLOCK
 */

import { ThoughtProofArchiver } from "./archiver.js";
import type { EpistemicBlock } from "./types.js";

async function main() {
  const args = process.argv.slice(2);

  const archiver = new ThoughtProofArchiver({ verbose: true });

  if (args.includes("--query")) {
    // Query mode: find archived blocks
    const verdictIdx = args.indexOf("--verdict");
    const verdict = verdictIdx !== -1
      ? (args[verdictIdx + 1] as "ALLOW" | "BLOCK" | "UNCERTAIN")
      : undefined;

    const domainIdx = args.indexOf("--domain");
    const domain = domainIdx !== -1 ? args[domainIdx + 1] : undefined;

    const agentIdx = args.indexOf("--agent");
    const agentId = agentIdx !== -1 ? args[agentIdx + 1] : undefined;

    console.log("🔍 Querying ThoughtProof blocks on Arweave...\n");
    if (verdict) console.log(`   Filter: verdict = ${verdict}`);
    if (domain) console.log(`   Filter: domain = ${domain}`);
    if (agentId) console.log(`   Filter: agent = ${agentId}`);

    const results = await archiver.query({
      verdict,
      domain,
      agentId,
      limit: 20,
    });

    if (results.length === 0) {
      console.log("\nNo blocks found matching criteria.");
      return;
    }

    console.log(`\nFound ${results.length} block(s):\n`);
    for (const ref of results) {
      console.log(`  📦 ${ref.arweaveId}`);
      console.log(`     Verdict: ${ref.tags["Verdict"] ?? "?"} | Confidence: ${ref.tags["Confidence"] ?? "?"}`);
      console.log(`     Agent: ${ref.tags["Agent-ID"] ?? "?"}`);
      console.log(`     Size: ${ref.size} bytes`);
      if (ref.blockHeight) {
        console.log(`     Block: #${ref.blockHeight} (${new Date(ref.blockTimestamp! * 1000).toISOString()})`);
      }
      console.log(`     URL: https://arweave.net/${ref.arweaveId}\n`);
    }
    return;
  }

  // Retrieve mode: fetch a specific block by TX ID
  const txId = args.find((a) => !a.startsWith("--"));
  if (!txId) {
    console.error("Usage:");
    console.error("  npm run verify -- <arweave-tx-id>        Retrieve a block");
    console.error("  npm run verify -- --query                List all blocks");
    console.error("  npm run verify -- --query --verdict BLOCK");
    console.error("  npm run verify -- --query --domain financial");
    process.exit(1);
  }

  console.log(`🔍 Retrieving block ${txId}...\n`);

  try {
    const block: EpistemicBlock = await archiver.retrieve(txId);

    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║            RETRIEVED EPISTEMIC BLOCK             ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(`║ ID:         ${block.id}`);
    console.log(`║ Verdict:    ${block.verification.verdict} (${block.verification.confidence})`);
    console.log(`║ Models:     ${block.verification.model_consensus.total_models}`);
    console.log(`║ Claim:      ${block.claim.text.slice(0, 60)}...`);
    console.log(`║ Signer:     ${block.attestation.signer}`);
    console.log(`║ Agent:      ${block.metadata.agent_id}`);
    console.log(`║ Protocol:   ${block.metadata.protocol}`);
    console.log("╚══════════════════════════════════════════════════╝");

    if (block.verification.model_verdicts) {
      console.log("\nModel Verdicts:");
      for (const mv of block.verification.model_verdicts) {
        const icon =
          mv.verdict === "ALLOW" ? "✅" : mv.verdict === "BLOCK" ? "❌" : "⚠️";
        console.log(
          `  ${icon} ${mv.model}: ${mv.verdict} (${mv.confidence}) — ${mv.reasoning.slice(0, 80)}...`
        );
      }
    }

    console.log("\n✅ Block integrity verified — permanently stored on Arweave.");
  } catch (err: any) {
    console.error(`❌ Failed to retrieve: ${err.message}`);
    console.error("   The block may not be indexed yet (can take 5-20 minutes).");
    process.exit(1);
  }
}

main().catch(console.error);
