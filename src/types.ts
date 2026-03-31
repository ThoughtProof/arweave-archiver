/**
 * ThoughtProof Epistemic Block — the canonical verification record
 * archived permanently on Arweave via ar.io Turbo SDK.
 *
 * Typical sizes:
 *   - Standard (5 models):  ~3 KB
 *   - Deep (7 models):      ~6-7 KB
 *   - Critical (10 models): ~10-11 KB
 *
 * All well within ar.io Free Tier (<100 KiB).
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
  /** Cost in Winston Credits (should be "0" for free tier) */
  cost: string;
  /** Data caches where the item is indexed */
  dataCaches: string[];
  /** Block size in bytes */
  sizeBytes: number;
  /** Timestamp of archival */
  archivedAt: string;
}

/** Configuration for the archiver */
export interface ArchiverConfig {
  /** Path to Arweave JWK wallet file */
  walletPath?: string;
  /** Arweave JWK directly */
  jwk?: JsonWebKey;
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
