# @thoughtproof/arweave-archiver

Permanently archive ThoughtProof Epistemic Blocks on Arweave via the [ar.io Turbo SDK](https://docs.ar.io/guides/turbo/).

## What it does

After ThoughtProof verifies an AI agent's decision (`/v1/check`), the resulting **Epistemic Block** — containing the verdict, model consensus, adversarial reasoning, and attestation metadata — is uploaded to Arweave for permanent, immutable storage.

```
Agent Request → ThoughtProof API → Epistemic Block
                    ↓                       ↓
              Base L2 (compact hash)   Arweave (full proof)
              ~$0.001/tx               Turbo Credits
              Smart contract ref       Permanent, queryable
```

### Block Sizes

Current ThoughtProof speeds discussed and deployed are:

| Speed    | Models | Size (compact) |
|----------|--------|----------------|
| Fast     | 3      | ~1.5-2 KB      |
| Standard | 5      | ~3-4 KB        |
| Deep     | 7      | ~4-5 KB        |

There is **no separate `critical` speed tier** in the current product/pricing model. `critical` may still appear as a historical/example `stakeLevel`, but billing and runtime depth currently map to `fast`, `standard`, and `deep` only.

Compact payloads optimized for efficient Turbo SDK uploads.

## Quick Start

```bash
# Install
npm install

# Generate an Arweave wallet (one-time)
npm run keygen

# Or copy the sample and fill in your own wallet
cp wallet.sample.json wallet.json

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

> `wallet.json` is intentionally ignored by git. Keep real wallets out of the repository and use `wallet.sample.json` only as a placeholder template.

## Usage as a Library

### Ethereum/Base Wallet (recommended)

```typescript
import { ThoughtProofArchiver } from "@thoughtproof/arweave-archiver";

const archiver = new ThoughtProofArchiver({
  ethereumKey: process.env.ETH_PRIVATE_KEY,  // 0x-prefixed
  token: "base-eth",                          // or "base-usdc", "base-ario"
  verbose: true,
});

await archiver.init();
```

### Arweave JWK (legacy)

```typescript
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

// Verify the embedded JWT against JWKS
const jwtCheck = await verifyBlockJwt(block);
console.log(`JWT valid: ${jwtCheck.ok}`);
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
| `Signer` | `0xAbDd...986d` | Attestation signer address |
| `Agent-ID` | `erc8004-28388` | ERC-8004 agent reference |
| `Protocol` | `ERC-8183` | Commerce protocol |
| `Chain-Parent` | `eb-prev-id` | Hash chain linkage |
| `Domain` | `financial` | Verification domain |
| `Stake-Level` | `high` | Risk level / example metadata |
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
- **Arweave**: Full Epistemic Block with reasoning (permanent, via Turbo Credits)

## Development

```bash
npm run test        # Size checks + unit tests
npm run build       # Compile TypeScript
```

## License

MIT — ThoughtProof
