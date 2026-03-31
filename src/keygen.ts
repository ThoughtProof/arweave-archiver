#!/usr/bin/env tsx
/**
 * Generate a new Arweave JWK wallet for ThoughtProof archival.
 * The wallet file is needed to sign data uploads to Arweave.
 *
 * Usage: npm run keygen
 */

import Arweave from "arweave";
import { writeFileSync, existsSync } from "fs";

const WALLET_PATH = "./wallet.json";

async function main() {
  if (existsSync(WALLET_PATH)) {
    console.error(`❌ ${WALLET_PATH} already exists. Delete it first if you want a new one.`);
    process.exit(1);
  }

  console.log("🔑 Generating new Arweave JWK wallet...\n");

  const arweave = Arweave.init({});
  const jwk = await arweave.wallets.generate();
  const address = await arweave.wallets.jwkToAddress(jwk);

  writeFileSync(WALLET_PATH, JSON.stringify(jwk, null, 2));

  console.log(`✅ Wallet generated!`);
  console.log(`   Address: ${address}`);
  console.log(`   File:    ${WALLET_PATH}`);
  console.log(`\n⚠️  Keep this file safe — it's your signing key.`);
  console.log(`   Add wallet.json to .gitignore!`);
  console.log(`\n💡 For free-tier uploads (<100 KiB), no AR tokens needed.`);
}

main().catch(console.error);
