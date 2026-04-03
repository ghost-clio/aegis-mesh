/**
 * Chain configurations for Aegis Mesh
 * Dual-chain: Arbitrum Sepolia + XRPL EVM Sidechain
 */

export const chains = {
  arbitrum: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    explorerApi: 'https://api.etherscan.io/v2/api',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    type: 'L2',
    settlement: '<5s',
  },
  xrplEvm: {
    name: 'XRPL EVM Sidechain',
    chainId: 1440000,
    rpcUrl: 'https://rpc.xrplevm.org',
    explorer: 'https://explorer.xrplevm.org',
    explorerApi: null, // No Etherscan-style API yet
    nativeCurrency: { name: 'XRP', symbol: 'XRP', decimals: 18 },
    usdc: null, // Will deploy or use wrapped stablecoin
    type: 'Sidechain',
    settlement: '<4s',
  },
};

export function getChain(name) {
  const chain = chains[name];
  if (!chain) throw new Error(`Unknown chain: ${name}. Available: ${Object.keys(chains).join(', ')}`);
  return chain;
}

export function allChains() {
  return Object.entries(chains).map(([id, config]) => ({ id, ...config }));
}
