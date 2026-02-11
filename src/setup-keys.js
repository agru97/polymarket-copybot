#!/usr/bin/env node
/**
 * ============================================
 * Polymarket Copy Bot — One-Time Setup
 * ============================================
 *
 * This script does 3 things:
 *   1. Derives your Polymarket API credentials from your wallet
 *   2. Checks your USDC balance on Polygon
 *   3. Approves USDC spending for Polymarket exchange contracts
 *
 * Prerequisites:
 *   - Set PRIVATE_KEY in your .env file
 *   - Have some MATIC in your wallet (~0.01 MATIC for gas)
 *   - Have USDC on Polygon
 *
 * Usage:
 *   node src/setup-keys.js
 */

require('dotenv').config();
const { ClobClient } = require('@polymarket/clob-client');
const { Wallet, ethers } = require('ethers');

const CLOB_HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137;
const POLYGON_RPC = 'https://polygon-rpc.com';

// Polymarket contract addresses on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDCe on Polygon
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

const MATIC_BALANCE_ABI = [];

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║  Polymarket Bot — One-Time Setup     ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  // Validate private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || privateKey === 'your_private_key_here') {
    console.error('  ❌ ERROR: Set PRIVATE_KEY in your .env file first!');
    console.error('');
    console.error('  Steps:');
    console.error('  1. Create a NEW wallet in Rabby or MetaMask');
    console.error('  2. Export the private key');
    console.error('  3. Add it to .env: PRIVATE_KEY=0xYourKeyHere');
    console.error('');
    process.exit(1);
  }

  const signer = new Wallet(privateKey);
  console.log(`  Wallet: ${signer.address}`);
  console.log('');

  // Connect to Polygon
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
  const connectedSigner = new Wallet(privateKey, provider);

  // Check MATIC balance (needed for gas)
  const maticBalance = await provider.getBalance(signer.address);
  const maticFormatted = ethers.utils.formatEther(maticBalance);
  console.log(`  MATIC balance: ${parseFloat(maticFormatted).toFixed(4)} MATIC`);

  if (maticBalance.lt(ethers.utils.parseEther('0.005'))) {
    console.error('  ⚠️  WARNING: Very low MATIC balance! You need ~0.01 MATIC for gas.');
    console.error('  Send some MATIC to your wallet on Polygon network.');
    console.error('');
  }

  // Check USDC balance
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, connectedSigner);
  const usdcBalance = await usdc.balanceOf(signer.address);
  const usdcFormatted = ethers.utils.formatUnits(usdcBalance, 6);
  console.log(`  USDC balance:  ${parseFloat(usdcFormatted).toFixed(2)} USDC`);
  console.log('');

  if (usdcBalance.isZero()) {
    console.warn('  ⚠️  No USDC in wallet yet. Fund it before starting the bot.');
    console.warn('  Use Kraken: deposit EUR via SEPA → buy USDC → withdraw to Polygon.');
    console.warn('');
  }

  // ─────────────────────────────────
  // Step 1: Derive API Credentials
  // ─────────────────────────────────
  console.log('  ── Step 1: Deriving Polymarket API credentials ──');
  console.log('');

  try {
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, signer);
    const creds = await tempClient.createOrDeriveApiKey();

    console.log('  ✅ API credentials derived successfully!');
    console.log('');
    console.log('  ┌────────────────────────────────────────────────┐');
    console.log('  │  Copy these values into your .env file:        │');
    console.log('  ├────────────────────────────────────────────────┤');
    console.log(`  │  POLYMARKET_API_KEY=${creds.key}`);
    console.log(`  │  POLYMARKET_API_SECRET=${creds.secret}`);
    console.log(`  │  POLYMARKET_API_PASSPHRASE=${creds.passphrase}`);
    console.log(`  │  WALLET_ADDRESS=${signer.address}`);
    console.log('  └────────────────────────────────────────────────┘');
    console.log('');
  } catch (err) {
    console.error(`  ❌ Failed to derive API keys: ${err.message}`);
    console.error('');
    if (err.message.includes('insufficient funds')) {
      console.error('  You need some MATIC for the signature transaction.');
    }
    console.error('  Make sure your private key is correct.');
    process.exit(1);
  }

  // ─────────────────────────────────
  // Step 2: USDC Approvals
  // ─────────────────────────────────
  console.log('  ── Step 2: Checking/setting USDC approvals ──');
  console.log('');

  const contracts = [
    ['CTF Exchange', CTF_EXCHANGE],
    ['Neg Risk Exchange', NEG_RISK_CTF_EXCHANGE],
  ];

  for (const [name, address] of contracts) {
    try {
      const allowance = await usdc.allowance(signer.address, address);

      if (allowance.gt(ethers.utils.parseUnits('1000000', 6))) {
        console.log(`  ✅ ${name}: already approved`);
      } else {
        console.log(`  → Approving USDC for ${name}...`);
        const tx = await usdc.approve(address, ethers.constants.MaxUint256);
        console.log(`    Tx: ${tx.hash}`);
        console.log('    Waiting for confirmation...');
        await tx.wait();
        console.log(`  ✅ ${name}: approved!`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to approve ${name}: ${err.message}`);
      if (err.message.includes('insufficient funds')) {
        console.error('    You need MATIC for gas. Send ~0.01 MATIC to your wallet.');
      }
    }
  }

  // ─────────────────────────────────
  // Done!
  // ─────────────────────────────────
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║  ✅ Setup complete!                      ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Copy the API credentials above into your .env');
  console.log('  2. Set DRY_RUN=false for live trading');
  console.log('  3. Add trader wallet addresses to GRINDER_TRADERS / EVENT_TRADERS');
  console.log('  4. Start the bot: pm2 start ecosystem.config.js');
  console.log('');
}

main().catch(err => {
  console.error('');
  console.error(`  Fatal error: ${err.message}`);
  console.error('');
  process.exit(1);
});
