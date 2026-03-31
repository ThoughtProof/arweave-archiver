/**
 * ThoughtProof Arweave Archiver
 *
 * Archives Epistemic Blocks permanently on Arweave via ar.io Turbo SDK.
 * All blocks (3-11 KB) fall within the free tier (<100 KiB).
 */

import { TurboFactory } from "@ardrive/turbo-sdk";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import type {
  EpistemicBlock,
  ArchiveResult,
  ArchiverConfig,
  ArchivedBlockRef,
} from "./types.js";

/** Current tagging schema version */
const SCHEMA_VERSION = "1.0.0";

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
      value:
        "sha256:" +
        createHash("sha256").update(block.claim.text).digest("hex").slice(0, 16),
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

  /** Validate an Epistemic Block has required fields before upload */
  private validateBlock(block: unknown): asserts block is EpistemicBlock {
    const b = block as Record<string, unknown>;
    if (!b || typeof b !== "object") {
      throw new Error("Block must be a non-null object");
    }
    if (!b.id || typeof b.id !== "string") {
      throw new Error("Block must have a string 'id'");
    }
    if (b.type !== "epistemic-block") {
      throw new Error(`Block type must be 'epistemic-block', got '${b.type}'`);
    }
    const v = b.verification as Record<string, unknown> | undefined;
    if (!v || !v.verdict || !["ALLOW", "BLOCK", "UNCERTAIN"].includes(v.verdict as string)) {
      throw new Error("Block must have a valid verification.verdict (ALLOW | BLOCK | UNCERTAIN)");
    }
    if (!b.attestation || !(b.attestation as Record<string, unknown>).signer) {
      throw new Error("Block must have attestation.signer");
    }
    if (!b.metadata || !(b.metadata as Record<string, unknown>).agent_id) {
      throw new Error("Block must have metadata.agent_id");
    }
  }

  /** Initialize the Turbo client. Must be called before archive/query. */
  async init(): Promise<void> {
    let jwk = this.config.jwk;

    if (!jwk && this.config.walletPath) {
      const raw = readFileSync(this.config.walletPath, "utf-8");
      jwk = JSON.parse(raw);
    }

    if (!jwk) {
      throw new Error(
        "No wallet provided. Pass walletPath or jwk in config.\n" +
          "Generate one with: npm run keygen"
      );
    }

    this.turbo = await TurboFactory.authenticated({
      privateKey: jwk as any,
      token: "arweave",
    });

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

    // Runtime validation
    this.validateBlock(block);

    const data = JSON.stringify(block);
    const sizeBytes = Buffer.byteLength(data, "utf-8");
    const tags = buildTags(block, baseTxHash);

    if (this.config.verbose) {
      console.log(`[archiver] Uploading block ${block.id} (${sizeBytes} bytes)`);
      console.log(`[archiver] Tags: ${tags.length} tags, ~${this.tagSize(tags)} bytes`);
    }

    // Retry with exponential backoff (3 attempts)
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await this.turbo.upload({
          data: Buffer.from(data),
          dataItemOpts: { tags },
        });

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
    const url = `${this.config.gatewayUrl}/${arweaveId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to retrieve block: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as EpistemicBlock;
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
          first: filters.limit ?? 10,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL query failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      data: {
        transactions: {
          edges: Array<{
            node: {
              id: string;
              tags: Array<{ name: string; value: string }>;
              data: { size: string };
              block: { height: number; timestamp: number } | null;
            };
          }>;
        };
      };
    };

    return result.data.transactions.edges.map((edge) => {
      const tags: Record<string, string> = {};
      for (const tag of edge.node.tags) {
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
