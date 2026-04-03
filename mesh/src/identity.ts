import { ethers } from "ethers";

const REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";

// ERC-8004 AgentIdentity — EIP-1967 proxy NFT contract.
// Implementation at 0x7274e874ca62410a93bd8bf61c69d8045e399c02.
// register(string) mints an NFT with metadata to msg.sender.
// Standard ERC-721: name()="AgentIdentity", symbol()="AGENT".
const abi = [
  "function register(string metadata)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const registry = new ethers.Contract(REGISTRY_ADDRESS, abi, provider);

/**
 * Registers a new agent on the ERC-8004 registry.
 * Mints an AgentIdentity NFT to the caller with JSON metadata.
 * @param privateKey - Ethereum private key used to sign the transaction.
 * @param agentName - Human-readable agent name (stored in metadata).
 * @param metadata - Arbitrary JSON-serializable metadata (name field will be set).
 * @returns Transaction hash.
 */
export async function registerAgent(
  privateKey: string,
  agentName: string,
  metadata: object
): Promise<{ txHash: string; agentName: string }> {
  const wallet = new ethers.Wallet(privateKey, provider);
  const contractWithSigner = registry.connect(wallet);

  const fullMetadata = JSON.stringify({ name: agentName, ...metadata });

  const tx = await contractWithSigner.getFunction("register")(fullMetadata);
  const receipt = await tx.wait();

  if (!receipt?.hash) {
    throw new Error("Transaction failed: no hash returned");
  }

  return { txHash: receipt.hash, agentName };
}

/**
 * Checks if an address has registered (owns at least one AgentIdentity NFT).
 * @param address - Ethereum address to check.
 * @returns True if the address owns at least one agent NFT.
 */
export async function isRegistered(address: string): Promise<boolean> {
  const balance = await registry.balanceOf(address);
  return balance > 0n;
}

/**
 * Gets agent metadata by token ID.
 * @param tokenId - The NFT token ID.
 * @returns Token URI (metadata) or null if not found.
 */
export async function getAgent(
  tokenId: string | number
): Promise<{ owner: string; metadata: any; tokenId: string } | null> {
  try {
    const owner = await registry.ownerOf(tokenId);
    const uri = await registry.tokenURI(tokenId);

    let metadata: any;
    try {
      // tokenURI may be a data URI or JSON string
      if (uri.startsWith("data:application/json")) {
        const json = uri.replace(/^data:application\/json[^,]*,/, "");
        metadata = JSON.parse(decodeURIComponent(json));
      } else {
        metadata = JSON.parse(uri);
      }
    } catch {
      metadata = uri;
    }

    return { owner, metadata, tokenId: String(tokenId) };
  } catch {
    return null;
  }
}

/**
 * Gets the registry contract info.
 */
export async function getRegistryInfo(): Promise<{ name: string; symbol: string; address: string }> {
  const [name, symbol] = await Promise.all([
    registry.name(),
    registry.symbol(),
  ]);
  return { name, symbol, address: REGISTRY_ADDRESS };
}

/**
 * Placeholder for listing agents — ERC-721 doesn't have enumeration by default.
 */
export async function listAgents(): Promise<Array<{ tokenId: string; owner: string }>> {
  return [];
}
