/**
 * Deploy AgentEscrow to Arbitrum Sepolia using ethers.js v6
 * Usage: DEPLOYER_KEY=0x... npx tsx scripts/deploy-ethers.ts
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const USDC_ADDRESS = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
const RPC = process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';

async function main() {
  const key = process.env.DEPLOYER_KEY;
  if (!key) { console.error('Set DEPLOYER_KEY env var'); process.exit(1); }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(key, provider);
  console.log('Deployer:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  if (balance === 0n) { console.error('No ETH for gas!'); process.exit(1); }

  const abi = JSON.parse(readFileSync('build/contracts_AgentEscrow_sol_AgentEscrow.abi', 'utf8'));
  const bytecode = '0x' + readFileSync('build/contracts_AgentEscrow_sol_AgentEscrow.bin', 'utf8');

  console.log('Deploying AgentEscrow...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(USDC_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('✅ AgentEscrow deployed to:', address);
  console.log(`\nExplorer: https://sepolia.arbiscan.io/address/${address}`);
  console.log(`Add to .env: ESCROW_ADDRESS=${address}`);
}

main().catch(console.error);
