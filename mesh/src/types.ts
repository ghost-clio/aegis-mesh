export interface ServiceEntry {
  id: string;
  seller: string;
  price: number;
  asset: string; // 'USDC' | 'ETH' (native)
  capability: string;
  endpoint: string;
}

export interface RepEntry {
  txCount: number;
  successCount: number;
}

export interface PolicyEntry {
  perTxLimit: number;
  dailyLimit: number;
}

export interface PaymentRequirement {
  amount: number;
  asset: string;
  network: string; // 'arbitrum:sepolia' | 'arbitrum:one'
  recipient: string;
}

export interface ServiceResult {
  success: boolean;
  data: unknown;
  latencyMs: number;
  txHash?: string;
  txVerified?: boolean;
  txDetails?: {
    from?: string;
    to?: string;
    amount?: string;
    memo?: string;
  };
}
