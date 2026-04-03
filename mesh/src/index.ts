import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import registry from './registry.js';
import { getBalance, submitPayment, verifyTransaction } from './arbitrum.js';
import { registerAgent, getAgent, isRegistered, getRegistryInfo } from './identity.js';
import { PaymentRequirement, ServiceResult } from './types.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3402', 10);
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS || '';
const NETWORK = 'arbitrum:sepolia';

const startTime = Date.now();

// ── Idempotency cache ──
const idempotencyCache = new Map<string, { result: any; timestamp: number }>();
const IDEMPOTENCY_TTL = 86400000;
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of idempotencyCache) {
    if (now - val.timestamp > IDEMPOTENCY_TTL) idempotencyCache.delete(key);
  }
}, 3600000);

// ── USDC price (always $1, but we track ETH for gas display) ──
let ethUsdPrice = 0;
let ethPriceUpdatedAt = 0;

async function getEthUsd(): Promise<number> {
  if (ethUsdPrice > 0 && Date.now() - ethPriceUpdatedAt < 300000) return ethUsdPrice;
  try {
    const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await resp.json() as any;
    ethUsdPrice = data?.ethereum?.usd ?? 0;
    ethPriceUpdatedAt = Date.now();
  } catch { /* keep stale */ }
  return ethUsdPrice;
}

// ── Transaction log ──
interface TxLogEntry {
  timestamp: string;
  buyer: string;
  service: string;
  amount: number;
  txHash: string;
  verified: boolean;
  type: 'payment' | 'rejection' | 'escrow_create' | 'escrow_claim' | 'escrow_refund';
  protocol?: 'x402' | 'escrow';
  details?: Record<string, unknown>;
}

const MAX_TX_LOG = 10000;
const GATEWAY_TX_LOG = process.env.GATEWAY_TX_LOG || './transactions.jsonl';
const txLog: TxLogEntry[] = [];

try {
  if (fs.existsSync(GATEWAY_TX_LOG)) {
    const lines = fs.readFileSync(GATEWAY_TX_LOG, 'utf-8').trim().split('\n').filter(Boolean);
    for (const line of lines.slice(-MAX_TX_LOG)) {
      try { txLog.push(JSON.parse(line)); } catch { /* skip */ }
    }
    console.log(`[${new Date().toISOString()}] Loaded ${txLog.length} transactions from ${GATEWAY_TX_LOG}`);
  }
} catch { /* first run */ }

function pushTxLog(entry: TxLogEntry): void {
  txLog.push(entry);
  if (txLog.length > MAX_TX_LOG) txLog.splice(0, txLog.length - MAX_TX_LOG);
  try { fs.appendFileSync(GATEWAY_TX_LOG, JSON.stringify(entry) + '\n', 'utf-8'); } catch { /* */ }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ──────────────────────────────────────────
// x402 PAYMENT FLOW — HTTP 402 for agent services
// ──────────────────────────────────────────

// POST /register — Register a service in the mesh
app.post('/register', (req: Request, res: Response) => {
  const { id, seller, price, capability, endpoint, asset } = req.body;
  if (!id || !seller || price == null || !capability || !endpoint) {
    res.status(400).json({ error: 'missing required fields: id, seller, price, capability, endpoint' });
    return;
  }
  if (typeof price !== 'number' || price < 0) {
    res.status(400).json({ error: 'price must be a non-negative number' });
    return;
  }
  registry.registerService(id, seller, price, capability, endpoint, asset || 'USDC');
  res.status(201).json({ registered: id, network: NETWORK });
});

// GET /discover — Find services by capability
app.get('/discover', async (req: Request, res: Response) => {
  const capability = String(req.query.capability || '');
  if (!capability) {
    res.status(400).json({ error: 'missing query parameter: capability' });
    return;
  }
  const ids = registry.discover(capability);
  const enriched = ids.map(id => {
    const svc = registry.getService(id);
    return {
      id, seller: svc?.seller,
      capability: svc?.capability, price: svc?.price,
      asset: svc?.asset ?? 'USDC',
      priceUsd: svc?.asset === 'USDC' ? `$${svc.price}` : 'N/A',
      network: NETWORK,
    };
  });
  res.json({ capability, services: enriched, network: NETWORK });
});

// GET /service/:id — Access a paid service (x402 flow)
app.get('/service/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const service = registry.getService(id);
  if (!service) { res.status(404).json({ error: 'service_not_found' }); return; }

  const rawProof = req.headers['x-payment-proof'];
  const paymentProof = Array.isArray(rawProof) ? rawProof[0] : rawProof;

  if (!paymentProof) {
    // 402 Payment Required
    const rawBuyer = req.headers['x-buyer-address'];
    const buyerAddress = (Array.isArray(rawBuyer) ? rawBuyer[0] : rawBuyer) ?? 'unknown';
    const price = registry.getPrice(id);

    const requirement: PaymentRequirement = {
      amount: price,
      asset: service.asset ?? 'USDC',
      network: NETWORK,
      recipient: RECIPIENT_ADDRESS,
    };

    res.status(402).json(requirement);
    return;
  }

  const rawBuyerAddr = req.headers['x-buyer-address'];
  const buyerAddress = (Array.isArray(rawBuyerAddr) ? rawBuyerAddr[0] : rawBuyerAddr) ?? 'unknown';
  const rawPaymentAmount = req.headers['x-payment-amount'];
  const paymentAmount = rawPaymentAmount
    ? parseFloat(Array.isArray(rawPaymentAmount) ? rawPaymentAmount[0] : rawPaymentAmount)
    : registry.getPrice(id);

  // Blocklist check
  if (registry.isBlocked(buyerAddress, service.seller)) {
    res.status(403).json({ error: 'seller_blocked', seller: service.seller });
    return;
  }

  // Rate limit check
  if (!registry.checkRateLimit(buyerAddress)) {
    res.status(429).json({ error: 'rate_limit_exceeded' });
    return;
  }
  registry.recordRequest(buyerAddress);

  // Spending policy check
  if (!registry.checkSpend(buyerAddress, paymentAmount)) {
    pushTxLog({
      timestamp: new Date().toISOString(),
      buyer: buyerAddress, service: id,
      amount: paymentAmount, txHash: '', verified: false,
      type: 'rejection', protocol: 'x402',
      details: { policy: registry.getSpendingPolicy(buyerAddress) },
    });
    res.status(403).json({ error: 'spending_policy_violation', requested: paymentAmount, policy: registry.getSpendingPolicy(buyerAddress) });
    return;
  }

  // Verify on-chain payment
  const verification = await verifyTransaction(paymentProof);
  const start = Date.now();

  // Forward to service endpoint
  let responseData: unknown;
  try {
    const query = req.query.q || req.query.query || 'default';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const serviceResponse = await fetch(
      `${service.endpoint}?q=${encodeURIComponent(String(query))}`,
      { headers: { 'X-BUYER-ADDRESS': buyerAddress, 'X-PAYMENT-MEMO': paymentProof ?? '' }, signal: controller.signal },
    );
    clearTimeout(timeout);
    responseData = await serviceResponse.json();
  } catch {
    responseData = { capability: service.capability, provider: service.seller, generated: new Date().toISOString(), note: 'service_endpoint_fallback' };
  }

  const result: ServiceResult = {
    success: true, data: responseData, latencyMs: Date.now() - start,
    txHash: paymentProof, txVerified: verification.verified,
    txDetails: verification.verified ? { from: verification.from, to: verification.to, amount: verification.amount } : undefined,
  };

  registry.updateReputation(buyerAddress, true);
  registry.confirmSpend(buyerAddress, paymentAmount, id);

  pushTxLog({
    timestamp: new Date().toISOString(), buyer: buyerAddress, service: id,
    amount: paymentAmount, txHash: paymentProof, verified: verification.verified,
    type: 'payment', protocol: 'x402',
  });

  res.json(result);
});

// ──────────────────────────────────────────
// IDENTITY — ERC-8004 Agent Registry
// ──────────────────────────────────────────

// POST /identity/register — Register agent on Arbitrum ERC-8004
// ⚠️ TESTNET ONLY: Private key is sent in request body for demo purposes.
// In production, use server-side signing with env-configured keys or wallet connect.
app.post('/identity/register', async (req: Request, res: Response) => {
  const { privateKey, agentName, metadata } = req.body;
  if (!privateKey || !agentName) {
    res.status(400).json({ error: 'missing privateKey or agentName' });
    return;
  }
  try {
    const result = await registerAgent(privateKey, agentName, metadata || {});
    res.status(201).json({ ...result, network: NETWORK });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /identity/registry — Get registry contract info
app.get('/identity/registry', async (_req: Request, res: Response) => {
  try {
    const info = await getRegistryInfo();
    res.json({ ...info, network: NETWORK });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /identity/:tokenId — Look up agent by NFT token ID
app.get('/identity/:tokenId', async (req: Request, res: Response) => {
  try {
    const agent = await getAgent(String(req.params.tokenId));
    if (!agent) { res.status(404).json({ error: 'agent_not_found' }); return; }
    res.json({ ...agent, network: NETWORK });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /identity/check/:address — Check if address has registered (owns AgentIdentity NFT)
app.get('/identity/check/:address', async (req: Request, res: Response) => {
  try {
    const registered = await isRegistered(String(req.params.address));
    res.json({ address: req.params.address, registered, network: NETWORK });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────
// PAYMENTS — Direct USDC transfers
// ──────────────────────────────────────────

// ⚠️ TESTNET ONLY: Private key is sent in request body for demo purposes.
// In production, use server-side signing with env-configured keys or wallet connect.
app.post('/pay', async (req: Request, res: Response) => {
  const { senderKey, destination, amount } = req.body;
  if (!senderKey || !destination || !amount) {
    res.status(400).json({ error: 'missing required fields: senderKey, destination, amount' });
    return;
  }

  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  if (idempotencyKey) {
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached) { res.json({ ...cached.result, idempotent: true }); return; }
  }

  try {
    const result = await submitPayment(senderKey, destination, String(amount));
    if (idempotencyKey) idempotencyCache.set(idempotencyKey, { result, timestamp: Date.now() });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const balance = await getBalance(String(req.params.address));
    res.json({ address: req.params.address, ...balance, network: NETWORK });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────
// REPUTATION & SPENDING
// ──────────────────────────────────────────

app.get('/reputation/:address', (req: Request, res: Response) => {
  const address = String(req.params.address);
  const stats = registry.getReputation(address);
  res.json({ address, ...stats, network: NETWORK });
});

app.get('/spending', async (req: Request, res: Response) => {
  const rawBuyer = req.headers['x-buyer-address'];
  const address = Array.isArray(rawBuyer) ? rawBuyer[0] : rawBuyer;
  if (!address) { res.status(400).json({ error: 'missing X-BUYER-ADDRESS header' }); return; }

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;
  const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10), 100) : 20;

  const summary = registry.getSpendingSummary(address, { since, until, limit });
  const policy = registry.getSpendingPolicy(address);

  res.json({ agent: address, ...summary, policy: policy ?? 'none', network: NETWORK });
});

app.post('/policy', (req: Request, res: Response) => {
  const { agent, perTxLimit, dailyLimit } = req.body;
  if (!agent || perTxLimit == null || dailyLimit == null) {
    res.status(400).json({ error: 'missing required fields' });
    return;
  }
  registry.setSpendingPolicy(agent, perTxLimit, dailyLimit);
  res.json({ agent, perTxLimit, dailyLimit });
});

// ──────────────────────────────────────────
// ADMIN — Fleet management
// ──────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY || '';

function requireAdmin(req: Request, res: Response): boolean {
  if (!ADMIN_KEY) { res.status(501).json({ error: 'admin_not_configured' }); return false; }
  const provided = req.headers['x-admin-key'] || req.query.key;
  if (provided !== ADMIN_KEY) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

app.get('/admin/spending', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const fleet = registry.getAllAgentSpending();
  const totalToday = fleet.reduce((sum, a) => sum + a.todaySpent, 0);
  res.json({
    agentCount: fleet.length,
    totalTodaySpent: parseFloat(totalToday.toFixed(6)),
    defaultPolicy: registry.getDefaultPolicy() ?? 'none',
    agents: fleet, network: NETWORK,
  });
});

app.post('/admin/default-policy', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { perTxLimit, dailyLimit } = req.body;
  if (perTxLimit == null || dailyLimit == null) { res.status(400).json({ error: 'missing fields' }); return; }
  registry.setDefaultPolicy(perTxLimit, dailyLimit);
  res.json({ defaultPolicy: { perTxLimit, dailyLimit } });
});

app.post('/admin/rate-limit', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { agent, maxPerMinute } = req.body;
  if (!agent || !maxPerMinute) { res.status(400).json({ error: 'missing fields' }); return; }
  registry.setRateLimit(agent, maxPerMinute);
  res.json({ agent, maxPerMinute });
});

// ──────────────────────────────────────────
// TRANSACTION LOG
// ──────────────────────────────────────────

app.get('/txlog', (req: Request, res: Response) => {
  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;
  const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10), 500) : 100;
  const format = req.query.format as string | undefined;

  let filtered = txLog;
  if (since) filtered = filtered.filter(t => t.timestamp >= new Date(since).toISOString());
  if (until) filtered = filtered.filter(t => t.timestamp <= new Date(until).toISOString());

  if (format === 'csv') {
    const header = 'timestamp,buyer,service,amount,txHash,verified,type,protocol\n';
    const rows = filtered.slice(-limit).map(t =>
      `${t.timestamp},${t.buyer},${t.service},${t.amount},${t.txHash},${t.verified},${t.type},${t.protocol ?? 'x402'}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=txlog.csv');
    res.send(header + rows);
    return;
  }

  res.json({
    count: filtered.length,
    verified: filtered.filter(t => t.verified).length,
    transactions: filtered.slice(-limit),
    network: NETWORK,
  });
});

// ──────────────────────────────────────────
// HEALTH
// ──────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    services: registry.serviceCount,
    transactions: txLog.length,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    network: NETWORK,
    identity: 'ERC-8004 @ 0x8004A818BFB912233c491871b3d84c89A494BD9e',
    features: [
      'x402_payments', 'usdc_micropayments', 'erc8004_identity',
      'service_discovery', 'reputation_tracking', 'spending_policies',
      'blocklist', 'rate_limiting', 'admin_fleet_view', 'escrow',
      'csv_export', 'idempotency',
    ],
  });
});

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: 'internal_server_error', message: err.message });
});

// Only listen when run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`ArbiLink Gateway running on port ${PORT}`);
    console.log(`Network: ${NETWORK} | Recipient: ${RECIPIENT_ADDRESS}`);
    console.log(`Identity: ERC-8004 @ 0x8004A818BFB912233c491871b3d84c89A494BD9e`);
  });
}

export default app;
