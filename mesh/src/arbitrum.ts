// arbitrum.ts
import { ethers } from "ethers";

// Constants
const ARBITRUM_SEPOLIA_RPC = "https://sepolia-rollup.arbitrum.io/rpc";
const USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

// Minimal USDC ABI for balanceOf, transfer, and Transfer event
const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// Provider (shared)
const provider = new ethers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
// Contract instance (read-only)
const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

/**
 * Get ETH and USDC balances for an address.
 * @param address - Arbitrum address
 * @returns Object with eth and usdc balances as strings (wei for ETH, smallest unit for USDC)
 */
export async function getBalance(address: string): Promise<{ eth: string; usdc: string }> {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  try {
    const [ethBalance, usdcBalance] = await Promise.all([
      provider.getBalance(address),
      usdcContract.balanceOf(address),
    ]);
    return {
      eth: ethBalance.toString(),
      usdc: usdcBalance.toString(),
    };
  } catch (err) {
    throw new Error(`Failed to fetch balances: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Submit a USDC payment.
 * @param privateKey - Sender's private key (0x prefixed)
 * @param to - Recipient address
 * @param amount - Amount of USDC to send (accepts string with up to 6 decimals, e.g., "10.5")
 * @returns Transaction details
 */
export async function submitPayment(
  privateKey: string,
  to: string,
  amount: string
): Promise<{ txHash: string; from: string; to: string; amount: string }> {
  if (!ethers.isAddress(to)) {
    throw new Error(`Invalid recipient address: ${to}`);
  }
  if (!ethers.isHexString(privateKey, 32)) {
    throw new Error("Invalid private key (must be 32-byte hex string)");
  }
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const usdcWithSigner = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);

    // Parse amount assuming USDC has 6 decimals
    const parsedAmount = ethers.parseUnits(amount, 6);
    const tx = await usdcWithSigner.getFunction("transfer")(to, parsedAmount);
    const receipt = await tx.wait();

    if (!receipt?.hash) {
      throw new Error("Transaction failed: no hash returned");
    }

    return {
      txHash: receipt.hash,
      from: wallet.address,
      to,
      amount: parsedAmount.toString(), // return amount in smallest unit (wei-equivalent)
    };
  } catch (err) {
    throw new Error(`Payment submission failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Verify a transaction and extract USDC transfer details if applicable.
 * @param txHash - Transaction hash
 * @returns Verification status and optional transfer details
 */
export async function verifyTransaction(
  txHash: string
): Promise<{
  verified: boolean;
  from?: string;
  to?: string;
  amount?: string;
}> {
  if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
    throw new Error(`Invalid transaction hash: ${txHash}`);
  }
  try {
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return { verified: false };
    }
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return { verified: false };
    }

    // Look for Transfer event from USDC contract
    let from: string | undefined;
    let to: string | undefined;
    let amount: string | undefined;

    for (const log of receipt.logs) {
      try {
        const parsed = usdcContract.interface.parseLog(log);
        if (parsed && parsed.name === "Transfer" && parsed.args) {
          from = parsed.args.from;
          to = parsed.args.to;
          amount = parsed.args.value.toString(); // smallest unit
          break; // first matching Transfer is sufficient
        }
      } catch {
        // Not a USDC Transfer log; continue
      }
    }

    if (from && to && amount !== undefined) {
      return { verified: true, from, to, amount };
    }
    // Transaction succeeded but not a USDC transfer we care about
    return { verified: false };
  } catch (err) {
    throw new Error(`Transaction verification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
