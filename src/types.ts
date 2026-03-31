/**
 * ThoughtProof Epistemic Block — the canonical verification record
 * archived permanently on Arweave via ar.io Turbo SDK.
 *
 * Typical sizes in the current deployed model:
 *   - Fast (3 models):      ~1.5-2 KB
 *   - Standard (5 models):  ~3-4 KB
 *   - Deep (7 models):      ~4-5 KB
 *
 * Note: there is currently no separate `critical` speed tier. Older
 * examples may still use `critical` as a stakeLevel metadata value.
 *
 * Compact payloads optimized for efficient Turbo SDK uploads.
 */

export interface ModelVerdict {
  model: string;
  verdict: "ALLOW" | "BLOCK" | "UNCERTAIN";
  confidence: number;
  reasoning: string;
}

export interface EpistemicBlock {
  version: string;
  type: "epistemic-block";
  id: string;
  claim: {
    text: string;
    source: string;
    submitted_at: string;
    domain?: string;
    stakeLevel?: "low" | "medium" | "high" | "critical";
  };
  verification: {
    verdict: "ALLOW" | "BLOCK" | "UNCERTAIN";
    confidence: number;
    model_consensus: {
      allow_models: number;
      block_models: number;
      uncertain_models: number;
      total_models: number;
    };
    dissent: string[];
    model_verdicts?: ModelVerdict[];
  };
  pipeline: {
    stages: string[];
    model_diversity_index: number;
    synthesis_audit_score: number;
    speed?: "fast" | "standard" | "deep";
    durationMs?: number;
    cost_usd?: number;
  };
  attestation: {
    receiptId?: string;
    signer: string;
    algorithm?: string;
    signature?: string;
    jwt?: string;
    blockHash?: string;
    hash_chain_parent: string;
    timestamp: number;
  };
  metadata: {
    agent_id: string;
    protocol: string;
    cost_usd?: number;
    provider: string;
    api_version?: string;
    verifyUrl?: string;
    jwks_url?: string;
  };
}

/** Result returned after archiving a block to Arweave */
export interface ArchiveResult {
  /** Arweave Transaction ID */
  arweaveId: string;
  /** Full gateway URL to retrieve the block */
  gatewayUrl: string;
  /** GraphQL-queryable URL */
  graphqlUrl: string;
  /** Cost in Winston Credits */
  cost: string;
  /** Data caches where the item is indexed */
  dataCaches: string[];
  /** Block size in bytes */
  sizeBytes: number;
  /** Timestamp of archival */
  archivedAt: string;
}

/** Token type for Turbo uploads */
export type TurboToken = "arweave" | "ethereum" | "base-eth" | "base-usdc" | "ario" | "base-ario";

/** Funding strategy for uploads */
export type FundingStrategy =
  | { type: "balance" }              // Use existing Turbo Credits balance
  | { type: "on-demand"; token: TurboToken; maxAmount?: string }; // Pay per upload

/** Configuration for the archiver */
export interface ArchiverConfig {
  /** Path to Arweave JWK wallet file (legacy) */
  walletPath?: string;
  /** Arweave JWK directly (legacy) */
  jwk?: JsonWebKey;
  /** Ethereum/Base private key (0x-prefixed hex string) — preferred */
  ethereumKey?: string;
  /** Token type for Turbo authentication (default: "arweave") */
  token?: TurboToken;
  /** Funding strategy (default: { type: "balance" }) */
  funding?: FundingStrategy;
  /** ar.io gateway URL (default: https://arweave.net) */
  gatewayUrl?: string;
  /** GraphQL endpoint (default: https://arweave.net/graphql) */
  graphqlUrl?: string;
  /** Whether to log upload progress */
  verbose?: boolean;
}

/** GraphQL query result for finding archived blocks */
export interface ArchivedBlockRef {
  arweaveId: string;
  tags: Record<string, string>;
  size: number;
  blockHeight?: number;
  blockTimestamp?: number;
}
