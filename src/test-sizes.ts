#!/usr/bin/env tsx
/**
 * Measure real Epistemic Block sizes for different verification depths.
 */

import { buildTags } from "./archiver.js";
import type { EpistemicBlock, ModelVerdict } from "./types.js";
import { createHash } from "crypto";

function makeBlock(numModels: number, speed: string, detailedReasoning: boolean): EpistemicBlock {
  const verdicts: ModelVerdict[] = [];
  const models = [
    "claude-sonnet-4-20250514", "grok-3", "deepseek-r1",
    "claude-opus-4-20250514", "grok-3-mini", "gemini-2.5-pro",
    "llama-4-maverick", "mistral-large", "qwen-3-235b", "command-r-plus",
  ];

  for (let i = 0; i < numModels; i++) {
    const reasoning = detailedReasoning
      ? `Comprehensive evaluation against ${3 + i} data sources. The claim was decomposed into ${4 + i} sub-claims, each verified independently. Confidence interval [${(0.2 + i * 0.05).toFixed(2)}, ${(0.5 + i * 0.07).toFixed(2)}]. Cross-validation concordance: ${(0.6 + i * 0.035).toFixed(3)}. Risk-adjusted score after temporal decay and source reliability weighting: ${(0.35 + i * 0.05).toFixed(3)}.`
      : `Evaluation complete. Score: ${(0.5 + i * 0.05).toFixed(2)}.`;

    verdicts.push({
      model: models[i % models.length],
      verdict: (["ALLOW", "BLOCK", "UNCERTAIN"] as const)[i % 3],
      confidence: 0.3 + i * 0.08,
      reasoning,
    });
  }

  return {
    version: "1.0",
    type: "epistemic-block",
    id: `eb-test-${numModels}m-${speed}`,
    claim: {
      text: detailedReasoning
        ? "A complex multi-sentence claim describing an AI agent decision involving financial settlement of €50,000 between autonomous agents under ERC-8183 protocol, including invoice analysis, vendor history cross-reference, and multi-factor risk assessment."
        : "GPT-5 achieves >90% accuracy on MMLU-Pro benchmark.",
      source: "agent-0xAbDdE1A06eEBD934fea35D4385cF68F43aCc986d",
      submitted_at: new Date().toISOString(),
      domain: "financial",
      stakeLevel: numModels <= 5 ? "medium" : "high",
    },
    verification: {
      verdict: "UNCERTAIN",
      confidence: 0.42,
      model_consensus: {
        allow_models: Math.floor(numModels * 0.4),
        block_models: Math.floor(numModels * 0.3),
        uncertain_models: numModels - Math.floor(numModels * 0.4) - Math.floor(numModels * 0.3),
        total_models: numModels,
      },
      dissent: detailedReasoning
        ? [
            "Extended dissent: Systematic bias in training data could inflate scores by 8-12%",
            "Independent replication yielded 84.2%, 86.1%, 83.7% — all below 90%",
            "Benchmark methodology revised in Q1 2026, invalidating direct comparisons",
            "Statistical significance: p=0.23 fails conventional p<0.05 threshold",
          ]
        : ["Insufficient data to confirm"],
      model_verdicts: verdicts,
    },
    pipeline: {
      stages: ["normalize", "generate", "adversarial_critique", "synthesize", "attestation"],
      model_diversity_index: 0.85,
      synthesis_audit_score: 0.78,
      speed: speed as "fast" | "standard" | "deep",
      durationMs: numModels * 800,
      cost_usd: speed === "fast" ? 0.008 : speed === "standard" ? 0.02 : 0.08,
    },
    attestation: {
      receiptId: `rcpt_${createHash("sha256").update(String(numModels)).digest("hex").slice(0, 20)}`,
      signer: "0xAbDdE1A06eEBD934fea35D4385cF68F43aCc986d",
      algorithm: "EdDSA",
      jwt: "demo-header.demo-payload.demo-signature",
      blockHash: "0x" + createHash("sha256").update(String(Date.now())).digest("hex"),
      hash_chain_parent: `eb-prev-${numModels}`,
      timestamp: Math.floor(Date.now() / 1000),
    },
    metadata: {
      agent_id: "erc8004-28388",
      protocol: "ERC-8183",
      cost_usd: speed === "fast" ? 0.008 : speed === "standard" ? 0.02 : 0.08,
      provider: "thoughtproof",
      api_version: "1.3.7",
      verifyUrl: "https://api.thoughtproof.ai/v1/receipts/rcpt_demo",
      jwks_url: "https://api.thoughtproof.ai/.well-known/jwks.json",
    },
  };
}

function main() {
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║         ThoughtProof Epistemic Block — Size Analysis             ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

  const scenarios = [
    { name: "Fast (3 models, brief)", models: 3, speed: "fast", detailed: false },
    { name: "Standard (5 models)", models: 5, speed: "standard", detailed: true },
    { name: "Deep (7 models)", models: 7, speed: "deep", detailed: true },
  ];

  const header = [
    "Scenario".padEnd(35),
    "Compact".padStart(10),
    "Pretty".padStart(10),
    "Tags".padStart(8),
  ].join(" ");
  console.log(header);
  console.log("─".repeat(75));

  for (const s of scenarios) {
    const block = makeBlock(s.models, s.speed, s.detailed);
    const compact = JSON.stringify(block);
    const pretty = JSON.stringify(block, null, 2);
    const tags = buildTags(block);
    const tagBytes = tags.reduce((sum, t) => sum + t.name.length + t.value.length, 0);
    const compactBytes = Buffer.byteLength(compact, "utf-8");
    const prettyBytes = Buffer.byteLength(pretty, "utf-8");

    const row = [
      s.name.padEnd(35),
      ((compactBytes / 1024).toFixed(1) + " KB").padStart(10),
      ((prettyBytes / 1024).toFixed(1) + " KB").padStart(10),
      (tagBytes + " B").padStart(8),
    ].join(" ");
    console.log(row);
  }

  console.log("\n" + "─".repeat(75));
  console.log("Tag budget: 4,096 bytes max");
  console.log("\n✅ Compact payloads — optimized for efficient Turbo SDK uploads.");
}

main();
