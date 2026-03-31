/**
 * ThoughtProof Arweave Archiver
 *
 * Archives Epistemic Blocks permanently on Arweave via ar.io Turbo SDK.
 * Compact payloads (roughly 1.5-5 KB in the current model) optimized for efficient Turbo uploads.
 */

import { TurboFactory } from "@ardrive/turbo-sdk";
import { readFileSync } from "fs";
import { createHash } from "crypto";

/** Dynamic import of OnDemandFunding to avoid type issues at compile time */
let OnDemandFundingClass: any = null;
async function getOnDemandFunding() {
  if (!OnDemandFundingClass) {
    const mod = await import("@ardrive/turbo-sdk");
    OnDemandFundingClass = (mod as any).OnDemandFunding;
  }
  return OnDemandFundingClass;
}
import type {
  EpistemicBlock,
  ArchiveResult,
  ArchiverConfig,
  ArchivedBlockRef,
} from "./types.js";
import { computeClaimHash } from "./integrity.js";

/** Current tagging schema version */
const SCHEMA_VERSION = "1.0.0";
const VALID_VERDICTS = ["ALLOW", "BLOCK", "UNCERTAIN"] as const;
const VALID_SPEEDS = ["fast", "standard", "deep"] as const;
const VALID_STAKE_LEVELS = ["low", "medium", "high", "critical"] as const;

/** Build Arweave tags from an Epistemic Block */
function buildTags(block: EpistemicBlock, baseTxHash?: string) {
  const tags: Array<{ name: string; value: string }> = [
    { name: "Content-Type", value: "application/json" },
    { name: "App-Name", value: "ThoughtProof" },
    { name: "App-Version", value: SCHEMA_VERSION },
    { name: "Type", value: "epistemic-block" },
    { name: "Block-ID", value: block.id },
    { name: "Verdict", value: block.verification.verdict },
    { name: "Confidence", value: String(block.verification.confidence) },
    {
      name: "Claim-Hash",
      value: computeClaimHash(block.claim.text),
    },
    { name: "Signer", value: block.attestation.signer },
    { name: "Agent-ID", value: block.metadata.agent_id },
    { name: "Protocol", value: block.metadata.protocol },
    { name: "Chain-Parent", value: block.attestation.hash_chain_parent },
    { name: "Timestamp", value: String(block.attestation.timestamp) },
  ];

  // Optional tags
  if (baseTxHash) {
    tags.push({ name: "Base-TX", value: baseTxHash });
  }
  if (block.claim.domain) {
    tags.push({ name: "Domain", value: block.claim.domain });
  }
  if (block.claim.stakeLevel) {
    tags.push({ name: "Stake-Level", value: block.claim.stakeLevel });
  }
  if (block.pipeline.speed) {
    tags.push({ name: "Speed", value: block.pipeline.speed });
  }
  if (block.attestation.receiptId) {
    tags.push({ name: "Receipt-ID", value: block.attestation.receiptId });
  }
  if (block.metadata.api_version) {
    tags.push({ name: "API-Version", value: block.metadata.api_version });
  }

  return tags;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertConfidence(value: unknown, path: string): asserts value is number {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new Error(`${path} must be a finite number between 0 and 1`);
  }
}

function assertPositiveInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
}

export class ThoughtProofArchiver {
  private turbo: Awaited<ReturnType<typeof TurboFactory.authenticated>> | null = null;
  private config: Required<
    Pick<ArchiverConfig, "gatewayUrl" | "graphqlUrl" | "verbose">
  > &
    ArchiverConfig;

  constructor(config: ArchiverConfig = {}) {
    this.config = {
      gatewayUrl: "https://arweave.net",
      graphqlUrl: "https://arweave.net/graphql",
      verbose: false,
      ...config,
    };
  }

  /** Validate an Epistemic Block has required fields before upload or after retrieval. */
  private validateBlock(block: unknown): asserts block is EpistemicBlock {
    const b = block as Record<string, unknown>;
    if (!b || typeof b !== "object") {
      throw new Error("Block must be a non-null object");
    }

    if (!isNonEmptyString(b.version)) {
      throw new Error("Block must have a non-empty string 'version'");
    }
    if (!isNonEmptyString(b.id)) {
      throw new Error("Block must have a non-empty string 'id'");
    }
    if (b.type !== "epistemic-block") {
      throw new Error(`Block type must be 'epistemic-block', got '${b.type}'`);
    }

    const claim = b.claim as Record<string, unknown> | undefined;
    if (!claim || typeof claim !== "object") {
      throw new Error("Block must have a claim object");
    }
    if (!isNonEmptyString(claim.text)) {
      throw new Error("Block must have claim.text");
    }
    if (!isNonEmptyString(claim.source)) {
      throw new Error("Block must have claim.source");
    }
    if (!isNonEmptyString(claim.submitted_at)) {
      throw new Error("Block must have claim.submitted_at");
    }
    if (claim.domain !== undefined && !isNonEmptyString(claim.domain)) {
      throw new Error("claim.domain, if present, must be a non-empty string");
    }
    if (
      claim.stakeLevel !== undefined &&
      !VALID_STAKE_LEVELS.includes(claim.stakeLevel as (typeof VALID_STAKE_LEVELS)[number])
    ) {
      throw new Error("claim.stakeLevel must be one of low|medium|high|critical");
    }

    const verification = b.verification as Record<string, unknown> | undefined;
    if (!verification || typeof verification !== "object") {
      throw new Error("Block must have a verification object");
    }
    if (
      !VALID_VERDICTS.includes(
        verification.verdict as (typeof VALID_VERDICTS)[number]
      )
    ) {
      throw new Error("verification.verdict must be ALLOW | BLOCK | UNCERTAIN");
    }
    assertConfidence(verification.confidence, "verification.confidence");

    const consensus = verification.model_consensus as Record<string, unknown> | undefined;
    if (!consensus || typeof consensus !== "object") {
      throw new Error("Block must have verification.model_consensus");
    }
    assertPositiveInteger(consensus.allow_models, "model_consensus.allow_models");
    assertPositiveInteger(consensus.block_models, "model_consensus.block_models");
    assertPositiveInteger(consensus.uncertain_models, "model_consensus.uncertain_models");
    assertPositiveInteger(consensus.total_models, "model_consensus.total_models");

    const sum =
      (consensus.allow_models as number) +
      (consensus.block_models as number) +
      (consensus.uncertain_models as number);
    if (sum !== consensus.total_models) {
      throw new Error(
        `model_consensus counts must sum to total_models (got ${sum} vs ${consensus.total_models})`
      );
    }

    if (!Array.isArray(verification.dissent)) {
      throw new Error("verification.dissent must be an array of strings");
    }
    for (const [i, item] of verification.dissent.entries()) {
      if (!isNonEmptyString(item)) {
        throw new Error(`verification.dissent[${i}] must be a non-empty string`);
      }
    }

    if (verification.model_verdicts !== undefined) {
      if (!Array.isArray(verification.model_verdicts)) {
        throw new Error("verification.model_verdicts must be an array if present");
      }
      for (const [i, mv] of verification.model_verdicts.entries()) {
        if (!mv || typeof mv !== "object") {
          throw new Error(`model_verdicts[${i}] must be an object`);
        }
        const verdict = mv as Record<string, unknown>;
        if (!isNonEmptyString(verdict.model)) {
          throw new Error(`model_verdicts[${i}].model must be a non-empty string`);
        }
        if (
          !VALID_VERDICTS.includes(verdict.verdict as (typeof VALID_VERDICTS)[number])
        ) {
          throw new Error(`model_verdicts[${i}].verdict must be ALLOW | BLOCK | UNCERTAIN`);
        }
        assertConfidence(verdict.confidence, `model_verdicts[${i}].confidence`);
        if (!isNonEmptyString(verdict.reasoning)) {
          throw new Error(`model_verdicts[${i}].reasoning must be a non-empty string`);
        }
      }
      if (verification.model_verdicts.length !== consensus.total_models) {
        throw new Error(
          `model_verdicts length must match model_consensus.total_models (got ${verification.model_verdicts.length} vs ${consensus.total_models})`
        );
      }
    }

    const pipeline = b.pipeline as Record<string, unknown> | undefined;
    if (!pipeline || typeof pipeline !== "object") {
      throw new Error("Block must have a pipeline object");
    }
    if (!Array.isArray(pipeline.stages) || pipeline.stages.length === 0) {
      throw new Error("pipeline.stages must be a non-empty array");
    }
    for (const [i, stage] of pipeline.stages.entries()) {
      if (!isNonEmptyString(stage)) {
        throw new Error(`pipeline.stages[${i}] must be a non-empty string`);
      }
    }
    assertConfidence(pipeline.model_diversity_index, "pipeline.model_diversity_index");
    assertConfidence(pipeline.synthesis_audit_score, "pipeline.synthesis_audit_score");
    if (
      pipeline.speed !== undefined &&
      !VALID_SPEEDS.includes(pipeline.speed as (typeof VALID_SPEEDS)[number])
    ) {
      throw new Error("pipeline.speed must be one of fast|standard|deep");
    }
    if (pipeline.durationMs !== undefined) {
      assertPositiveInteger(pipeline.durationMs, "pipeline.durationMs");
    }
    if (pipeline.cost_usd !== undefined && (!isFiniteNumber(pipeline.cost_usd) || pipeline.cost_usd < 0)) {
      throw new Error("pipeline.cost_usd must be a non-negative finite number");
    }

    const attestation = b.attestation as Record<string, unknown> | undefined;
    if (!attestation || typeof attestation !== "object") {
      throw new Error("Block must have an attestation object");
    }
    if (!isNonEmptyString(attestation.signer)) {
      throw new Error("Block must have attestation.signer");
    }
    if (!isNonEmptyString(attestation.hash_chain_parent)) {
      throw new Error("Block must have attestation.hash_chain_parent");
    }
    if (!Number.isInteger(attestation.timestamp) || (attestation.timestamp as number) <= 0) {
      throw new Error("attestation.timestamp must be a positive integer unix timestamp");
    }
    if (attestation.receiptId !== undefined && !isNonEmptyString(attestation.receiptId)) {
      throw new Error("attestation.receiptId, if present, must be a non-empty string");
    }
    if (attestation.algorithm !== undefined && !isNonEmptyString(attestation.algorithm)) {
      throw new Error("attestation.algorithm, if present, must be a non-empty string");
    }
    if (attestation.signature !== undefined && !isNonEmptyString(attestation.signature)) {
      throw new Error("attestation.signature, if present, must be a non-empty string");
    }
    if (attestation.jwt !== undefined && !isNonEmptyString(attestation.jwt)) {
      throw new Error("attestation.jwt, if present, must be a non-empty string");
    }
    if (attestation.blockHash !== undefined && !isNonEmptyString(attestation.blockHash)) {
      throw new Error("attestation.blockHash, if present, must be a non-empty string");
    }

    const metadata = b.metadata as Record<string, unknown> | undefined;
    if (!metadata || typeof metadata !== "object") {
      throw new Error("Block must have a metadata object");
    }
    if (!isNonEmptyString(metadata.agent_id)) {
      throw new Error("Block must have metadata.agent_id");
    }
    if (!isNonEmptyString(metadata.protocol)) {
      throw new Error("Block must have metadata.protocol");
    }
    if (!isNonEmptyString(metadata.provider)) {
      throw new Error("Block must have metadata.provider");
    }
    if (metadata.cost_usd !== undefined && (!isFiniteNumber(metadata.cost_usd) || metadata.cost_usd < 0)) {
      throw new Error("metadata.cost_usd must be a non-negative finite number");
    }
    if (metadata.api_version !== undefined && !isNonEmptyString(metadata.api_version)) {
      throw new Error("metadata.api_version, if present, must be a non-empty string");
    }
    if (metadata.verifyUrl !== undefined && !isNonEmptyString(metadata.verifyUrl)) {
      throw new Error("metadata.verifyUrl, if present, must be a non-empty string");
    }
    if (metadata.jwks_url !== undefined && !isNonEmptyString(metadata.jwks_url)) {
      throw new Error("metadata.jwks_url, if present, must be a non-empty string");
    }
  }

  /** Initialize the Turbo client. Must be called before archive/query. */
  async init(): Promise<void> {
    const token = this.config.token ?? "arweave";

    // Preferred: Ethereum/Base private key
    if (this.config.ethereumKey) {
      if (this.config.verbose) {
        console.log(`[archiver] Authenticating with Ethereum wallet (token: ${token})`);
      }
      this.turbo = await TurboFactory.authenticated({
        privateKey: this.config.ethereumKey as any,
        token: token as any,
      });
    } else {
      // Legacy: Arweave JWK
      let jwk = this.config.jwk;

      if (!jwk && this.config.walletPath) {
        const raw = readFileSync(this.config.walletPath, "utf-8");
        jwk = JSON.parse(raw);
      }

      if (!jwk) {
        throw new Error(
          "No wallet provided. Pass ethereumKey (preferred) or walletPath/jwk (legacy).\n" +
            "Example: new ThoughtProofArchiver({ ethereumKey: '0x...', token: 'base-eth' })"
        );
      }

      if (this.config.verbose) {
        console.log(`[archiver] Authenticating with Arweave JWK (legacy mode)`);
      }
      this.turbo = await TurboFactory.authenticated({
        privateKey: jwk as any,
        token: "arweave",
      });
    }

    if (this.config.verbose) {
      const balance = await this.turbo.getBalance();
      console.log(`[archiver] Connected. Balance: ${balance.winc} winc`);
    }
  }

  /**
   * Archive an Epistemic Block to Arweave.
   *
   * @param block - The Epistemic Block to archive
   * @param baseTxHash - Optional Base L2 transaction hash for cross-referencing
   * @returns Archive result with Arweave transaction ID and URLs
   */
  async archive(
    block: EpistemicBlock,
    baseTxHash?: string
  ): Promise<ArchiveResult> {
    if (!this.turbo) {
      throw new Error("Archiver not initialized. Call init() first.");
    }

    this.validateBlock(block);

    const data = JSON.stringify(block);
    const sizeBytes = Buffer.byteLength(data, "utf-8");
    const tags = buildTags(block, baseTxHash);

    if (this.config.verbose) {
      console.log(`[archiver] Uploading block ${block.id} (${sizeBytes} bytes)`);
      console.log(`[archiver] Tags: ${tags.length} tags, ~${this.tagSize(tags)} bytes`);
    }

    // Build upload options, including on-demand funding if configured
    const uploadOpts: Record<string, any> = {
      data: Buffer.from(data),
      dataItemOpts: { tags },
    };

    const funding = this.config.funding;
    if (funding?.type === "on-demand") {
      const ODFunding = await getOnDemandFunding();
      if (!ODFunding) {
        throw new Error(
          "OnDemandFunding not available in this version of @ardrive/turbo-sdk. " +
            "Update to v1.41+ or use { type: 'balance' } funding."
        );
      }
      const opts: Record<string, any> = {
        topUpBufferMultiplier: 1.2,
      };
      if (funding.maxAmount) {
        opts.maxTokenAmount = funding.maxAmount;
      }
      uploadOpts.fundingMode = new ODFunding(opts);
      if (this.config.verbose) {
        console.log(
          `[archiver] Using on-demand funding (token: ${funding.token}, max: ${funding.maxAmount ?? "auto"})`
        );
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await (this.turbo.upload as any)(uploadOpts);

        const archiveResult: ArchiveResult = {
          arweaveId: result.id,
          gatewayUrl: `${this.config.gatewayUrl}/${result.id}`,
          graphqlUrl: `${this.config.graphqlUrl}`,
          cost: result.winc,
          dataCaches: result.dataCaches,
          sizeBytes,
          archivedAt: new Date().toISOString(),
        };

        if (this.config.verbose) {
          console.log(`[archiver] ✅ Archived: ${archiveResult.gatewayUrl}`);
          console.log(`[archiver] Cost: ${result.winc} winc`);
        }

        return archiveResult;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (this.config.verbose) {
          console.warn(`[archiver] Attempt ${attempt}/3 failed: ${lastError.message}`);
        }
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
      }
    }

    const err = new Error(
      `Failed to archive block ${block.id} after 3 attempts: ${lastError?.message}`
    );
    (err as any).cause = lastError;
    throw err;
  }

  /**
   * Retrieve an archived Epistemic Block by its Arweave transaction ID.
   */
  async retrieve(arweaveId: string): Promise<EpistemicBlock> {
    if (!isNonEmptyString(arweaveId)) {
      throw new Error("arweaveId must be a non-empty string");
    }

    const url = `${this.config.gatewayUrl}/${arweaveId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to retrieve block: ${response.status} ${response.statusText}`);
    }

    const block = (await response.json()) as unknown;
    this.validateBlock(block);
    return block;
  }

  /**
   * Query archived blocks via GraphQL.
   * Supports filtering by verdict, domain, agent, time range, etc.
   */
  async query(filters: {
    verdict?: "ALLOW" | "BLOCK" | "UNCERTAIN";
    domain?: string;
    agentId?: string;
    limit?: number;
  }): Promise<ArchivedBlockRef[]> {
    const tagFilters: Array<{ name: string; values: string[] }> = [
      { name: "App-Name", values: ["ThoughtProof"] },
      { name: "Type", values: ["epistemic-block"] },
    ];

    if (filters.verdict) {
      tagFilters.push({ name: "Verdict", values: [filters.verdict] });
    }
    if (filters.domain) {
      tagFilters.push({ name: "Domain", values: [filters.domain] });
    }
    if (filters.agentId) {
      tagFilters.push({ name: "Agent-ID", values: [filters.agentId] });
    }

    const query = `
      query FindEpistemicBlocks($tags: [TagFilter!], $first: Int) {
        transactions(tags: $tags, sort: HEIGHT_DESC, first: $first) {
          edges {
            node {
              id
              tags { name value }
              data { size }
              block { height timestamp }
            }
          }
        }
      }
    `;

    const response = await fetch(this.config.graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          tags: tagFilters,
          first: Math.min(Math.max(filters.limit ?? 10, 1), 100),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL query failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      data?: {
        transactions?: {
          edges?: Array<{
            node: {
              id: string;
              tags: Array<{ name: string; value: string }>;
              data: { size: string };
              block: { height: number; timestamp: number } | null;
            };
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (result.errors?.length) {
      throw new Error(
        `GraphQL query returned errors: ${result.errors
          .map((e) => e.message || "unknown error")
          .join("; ")}`
      );
    }

    const edges = result.data?.transactions?.edges;
    if (!Array.isArray(edges)) {
      throw new Error("GraphQL query returned an unexpected response shape");
    }

    return edges.map((edge) => {
      const tags: Record<string, string> = {};
      for (const tag of edge.node.tags ?? []) {
        tags[tag.name] = tag.value;
      }
      return {
        arweaveId: edge.node.id,
        tags,
        size: parseInt(edge.node.data.size, 10),
        blockHeight: edge.node.block?.height,
        blockTimestamp: edge.node.block?.timestamp,
      };
    });
  }

  /** Check current Turbo balance */
  async getBalance(): Promise<string> {
    if (!this.turbo) throw new Error("Not initialized");
    const balance = await this.turbo.getBalance();
    return balance.winc;
  }

  /** Estimate tag size in bytes */
  private tagSize(tags: Array<{ name: string; value: string }>): number {
    return tags.reduce((sum, t) => sum + t.name.length + t.value.length, 0);
  }
}

export { buildTags };
