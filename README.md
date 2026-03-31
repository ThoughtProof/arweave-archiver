# @thoughtproof/arweave-archiver

Permanently archive ThoughtProof Epistemic Blocks on Arweave via the [ar.io Turbo SDK](https://docs.ar.io/guides/turbo/).

## What it does

After ThoughtProof verifies an AI agent's decision (`/v1/check`), the resulting **Epistemic Block** — containing the verdict, model consensus, adversarial reasoning, and EdDSA attestation — is uploaded to Arweave for permanent, immutable storage.

```
Agent Request → ThoughtProof API → Epistemic Block
                    ↓                       ↓
              Base L2 (compact hash)   Arweave (full proof)
              ~$0.001/tx               FREE via Turbo SDK
              Smart contract ref       Permanent, queryable
```

### Block Sizes

| Speed    | Models | Size (compact) | ar.io Free Tier? |
|----------|--------|---------------|------------------|
| Fast     | 3      | ~2 KB         | ✅ Free          |
| Standard | 5      | ~3-4 KB       | ✅ Free          |
| Deep     | 7      | ~6-7 KB       | ✅ Free          |
| Critical | 10     | ~10-11 KB     | ✅ Free          |

Free tier limit: 100 KiB per upload. All ThoughtProof blocks are well within this.

## Quick Start

```bash
# Install
npm install

# Generate an Arweave wallet (one-time)
npm run keygen

# Dry run — see what gets uploaded
npm run demo:dry

# Live upload to Arweave
npm run demo

# Verify / retrieve a block
npm run verify -- <arweave-tx-id>

# Query all ThoughtProof blocks
npm run verify -- --query

# Filter by verdict
npm run verify -- --query --verdict BLOCK --domain financial
```

## Usage as a Library

```typescript
import { ThoughtProofArchiver } from "@thoughtproof/arweave-archiver";

const archiver = new ThoughtProofArchiver({
  walletPath: "./wallet.json",
  verbose: true,
});

await archiver.init();

// Archive after each /v1/check call
const result = await archiver.archive(epistemicBlock, baseTxHash);
console.log(`Permanent URL: https://arweave.net/${result.arweaveId}`);

// Query archived blocks
const blocks = await archiver.query({
  verdict: "BLOCK",
  domain: "financial",
  agentId: "erc8004-28388",
});

// Retrieve a specific block
const block = await archiver.retrieve(arweaveId);
```

## Tagging Schema

Every block is uploaded with queryable tags (GraphQL-compatible):

| Tag | Example | Purpose |
|-----|---------|---------|
| `App-Name` | `ThoughtProof` | App discovery |
| `Type` | `epistemic-block` | Data type |
| `Block-ID` | `eb-1743408000-a1b2c3d4` | Unique block identifier |
| `Verdict` | `ALLOW` / `BLOCK` / `UNCERTAIN` | Quick filtering |
| `Confidence` | `0.87` | Verification confidence |
| `Claim-Hash` | `sha256:abc123...` | Content-addressable claim ref |
| `Signer` | `0xAbDd...986d` | EdDSA signer address |
| `Agent-ID` | `erc8004-28388` | ERC-8004 agent reference |
| `Protocol` | `ERC-8183` | Commerce protocol |
| `Chain-Parent` | `eb-prev-id` | Hash chain linkage |
| `Domain` | `financial` | Verification domain |
| `Stake-Level` | `high` | Risk level |
| `Base-TX` | `0x7890...abcd` | Base L2 tx cross-reference |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   AI Agent   │────▶│  ThoughtProof    │────▶│  Arweave    │
│  (ERC-8183)  │     │  /v1/check API   │     │  (Turbo SDK)│
└─────────────┘     └──────────────────┘     └─────────────┘
                           │                        │
                           ▼                        ▼
                    ┌──────────────┐         ┌──────────────┐
                    │ Base L2      │         │ GraphQL API  │
                    │ (hash only)  │         │ (full block) │
                    └──────────────┘         └──────────────┘
```

**Dual-layer storage:**
- **Base L2**: Compact attestation hash on-chain (~$0.001/tx)
- **Arweave**: Full Epistemic Block with reasoning (FREE, permanent)

## Development

```bash
npm run test        # Measure block sizes
npm run build       # Compile TypeScript
```

## License

MIT — ThoughtProof
