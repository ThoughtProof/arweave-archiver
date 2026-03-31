import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "crypto";
import { ThoughtProofArchiver } from "./archiver.js";
import { verifyJwtEdDsa } from "./crypto.js";
import { computeBlockDigest, verifyBlockIntegrity } from "./integrity.js";
import type { EpistemicBlock } from "./types.js";

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]) {
  const header = base64Url(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: "thoughtproof.ai", verdict: "ALLOW" }));
  const signingInput = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

function makeBlock(overrides: Partial<EpistemicBlock> = {}): EpistemicBlock {
  const block: EpistemicBlock = {
    version: "1.0",
    type: "epistemic-block",
    id: "eb-test-1",
    claim: {
      text: "Test claim",
      source: "agent-1",
      submitted_at: new Date().toISOString(),
      domain: "financial",
      stakeLevel: "high",
    },
    verification: {
      verdict: "ALLOW",
      confidence: 0.9,
      model_consensus: {
        allow_models: 4,
        block_models: 0,
        uncertain_models: 1,
        total_models: 5,
      },
      dissent: ["One dissenting view"],
      model_verdicts: [
        { model: "m1", verdict: "ALLOW", confidence: 0.9, reasoning: "ok" },
        { model: "m2", verdict: "ALLOW", confidence: 0.9, reasoning: "ok" },
        { model: "m3", verdict: "ALLOW", confidence: 0.9, reasoning: "ok" },
        { model: "m4", verdict: "ALLOW", confidence: 0.9, reasoning: "ok" },
        { model: "m5", verdict: "UNCERTAIN", confidence: 0.4, reasoning: "ok" },
      ],
    },
    pipeline: {
      stages: ["normalize", "generate", "synthesize"],
      model_diversity_index: 0.8,
      synthesis_audit_score: 0.85,
      speed: "standard",
      durationMs: 1234,
      cost_usd: 0.02,
    },
    attestation: {
      signer: "0xsigner",
      hash_chain_parent: "eb-prev-1",
      timestamp: Math.floor(Date.now() / 1000),
      jwt: "demo.header.sig",
      blockHash: "",
    },
    metadata: {
      agent_id: "erc8004-28388",
      protocol: "ERC-8183",
      provider: "thoughtproof",
      cost_usd: 0.02,
      api_version: "1.3.7",
      verifyUrl: "https://api.thoughtproof.ai/v1/receipts/demo",
      jwks_url: "https://api.thoughtproof.ai/.well-known/jwks.json",
    },
    ...overrides,
  };
  return block;
}

const archiver = new ThoughtProofArchiver();
const validate = (block: unknown) =>
  (archiver as unknown as { validateBlock: (b: unknown) => void }).validateBlock(block);

test("validateBlock accepts a well-formed block", () => {
  const block = makeBlock();
  block.attestation.blockHash = computeBlockDigest(block);
  assert.doesNotThrow(() => validate(block));
});

test("validateBlock rejects invalid pipeline speed", () => {
  const block = makeBlock();
  block.attestation.blockHash = computeBlockDigest(block);
  (block.pipeline as any).speed = "critical";
  assert.throws(() => validate(block), /pipeline\.speed/);
});

test("validateBlock rejects inconsistent model consensus", () => {
  const block = makeBlock();
  block.attestation.blockHash = computeBlockDigest(block);
  block.verification.model_consensus.total_models = 4;
  assert.throws(() => validate(block), /sum to total_models/);
});

test("validateBlock rejects mismatched model verdict length", () => {
  const block = makeBlock();
  block.attestation.blockHash = computeBlockDigest(block);
  block.verification.model_verdicts = block.verification.model_verdicts?.slice(0, 4);
  assert.throws(() => validate(block), /model_verdicts length must match/);
});

test("verifyJwtEdDsa verifies a real Ed25519 JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwt = makeJwt(privateKey);
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  assert.equal(verifyJwtEdDsa(jwt, jwk), true);
});

test("verifyBlockIntegrity validates matching block hash", () => {
  const block = makeBlock();
  block.attestation.blockHash = computeBlockDigest(block);
  const result = verifyBlockIntegrity(block);
  assert.equal(result.claimHash.ok, true);
  assert.equal(result.blockHash.ok, true);
});

test("verifyBlockIntegrity detects mismatched block hash", () => {
  const block = makeBlock();
  block.attestation.blockHash = "0xdeadbeef";
  const result = verifyBlockIntegrity(block);
  assert.equal(result.blockHash.ok, false);
});
