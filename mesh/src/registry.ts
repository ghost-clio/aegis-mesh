import { ServiceEntry, RepEntry, PolicyEntry } from './types.js';

interface SpendRecord {
  serviceId: string;
  amount: number;
  timestamp: string;
}

class InMemoryRegistry {
  private services: Map<string, ServiceEntry> = new Map();
  private reputations: Map<string, RepEntry> = new Map();
  private policies: Map<string, PolicyEntry> = new Map();
  private dailySpend: Map<string, { amount: number; date: string }> = new Map();
  private spendLedger: Map<string, SpendRecord[]> = new Map();
  private blocklist: Map<string, Set<string>> = new Map(); // buyer → set of blocked sellers
  private spendAlerts: Map<string, { threshold: number; webhook?: string; percent: number }> = new Map();

  registerService(
    id: string,
    seller: string,
    price: number,
    capability: string,
    endpoint: string,
    asset: string = 'native',
  ): void {
    this.services.set(id, { id, seller, price, asset, capability, endpoint });
  }

  getService(id: string): ServiceEntry | undefined {
    return this.services.get(id);
  }

  discover(capability: string): string[] {
    const results: string[] = [];
    for (const [id, entry] of this.services) {
      if (entry.capability === capability) {
        results.push(id);
      }
    }
    return results;
  }

  updateReputation(agent: string, success: boolean): void {
    const rep = this.getReputation(agent);
    rep.txCount += 1;
    if (success) {
      rep.successCount += 1;
    }
    this.reputations.set(agent, rep);
  }

  getReputation(agent: string): RepEntry {
    return this.reputations.get(agent) ?? { txCount: 0, successCount: 0 };
  }

  // ── DEFAULT POLICY (fleet-wide) ──
  private defaultPolicy: PolicyEntry | null = null;
  private rateLimits: Map<string, { maxPerMin: number; timestamps: number[] }> = new Map();

  setDefaultPolicy(perTxLimit: number, dailyLimit: number): void {
    this.defaultPolicy = { perTxLimit, dailyLimit };
  }

  getDefaultPolicy(): PolicyEntry | null {
    return this.defaultPolicy;
  }

  setSpendingPolicy(agent: string, perTxLimit: number, dailyLimit: number): void {
    this.policies.set(agent, { perTxLimit, dailyLimit });
  }

  // ── RATE LIMITING ──

  setRateLimit(agent: string, maxPerMin: number): void {
    const existing = this.rateLimits.get(agent);
    this.rateLimits.set(agent, { maxPerMin, timestamps: existing?.timestamps ?? [] });
  }

  checkRateLimit(agent: string): boolean {
    const rl = this.rateLimits.get(agent);
    if (!rl) return true;
    const now = Date.now();
    // Prune timestamps older than 60s
    rl.timestamps = rl.timestamps.filter(t => now - t < 60000);
    return rl.timestamps.length < rl.maxPerMin;
  }

  recordRequest(agent: string): void {
    const rl = this.rateLimits.get(agent);
    if (rl) rl.timestamps.push(Date.now());
  }

  /**
   * Check if a spend is within policy limits.
   * Falls back to default policy if no agent-specific policy is set.
   */
  checkSpend(agent: string, amount: number): boolean {
    const policy = this.policies.get(agent) ?? this.defaultPolicy;
    if (!policy) {
      return true;
    }

    if (amount > policy.perTxLimit) {
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    const daily = this.dailySpend.get(agent);

    let spent = 0;
    if (daily && daily.date === today) {
      spent = daily.amount;
    }

    if (spent + amount > policy.dailyLimit) {
      return false;
    }

    return true;
  }

  /**
   * Record a confirmed spend against daily limit.
   * Call this AFTER payment is verified, not during checkSpend.
   */
  confirmSpend(agent: string, amount: number, serviceId?: string): void {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const daily = this.dailySpend.get(agent);
    let spent = 0;
    if (daily && daily.date === today) {
      spent = daily.amount;
    }
    this.dailySpend.set(agent, { amount: spent + amount, date: today });

    // Record to spending ledger
    if (!this.spendLedger.has(agent)) {
      this.spendLedger.set(agent, []);
    }
    this.spendLedger.get(agent)!.push({
      serviceId: serviceId ?? 'unknown',
      amount,
      timestamp: now.toISOString(),
    });
  }

  getSpendingSummary(agent: string, options?: { since?: string; until?: string; limit?: number }): {
    totalSpent: number;
    txCount: number;
    byService: Record<string, { count: number; spent: number }>;
    byDay: Record<string, number>;
    recent: SpendRecord[];
    period: { from: string | null; to: string | null };
  } {
    const allRecords = this.spendLedger.get(agent) ?? [];

    // Filter by time range
    const since = options?.since ?? null;
    const until = options?.until ?? null;
    const filtered = allRecords.filter(r => {
      if (since && r.timestamp < since) return false;
      if (until && r.timestamp > until) return false;
      return true;
    });

    const byService: Record<string, { count: number; spent: number }> = {};
    const byDay: Record<string, number> = {};
    let totalSpent = 0;

    for (const r of filtered) {
      totalSpent += r.amount;

      if (!byService[r.serviceId]) {
        byService[r.serviceId] = { count: 0, spent: 0 };
      }
      byService[r.serviceId].count++;
      byService[r.serviceId].spent = parseFloat((byService[r.serviceId].spent + r.amount).toFixed(7));

      const day = r.timestamp.slice(0, 10);
      byDay[day] = parseFloat(((byDay[day] ?? 0) + r.amount).toFixed(7));
    }

    const limit = options?.limit ?? 20;

    return {
      totalSpent: parseFloat(totalSpent.toFixed(7)),
      txCount: filtered.length,
      byService,
      byDay,
      recent: filtered.slice(-limit),
      period: { from: since, to: until },
    };
  }

  getPrice(serviceId: string): number {
    const service = this.getService(serviceId);
    return service?.price ?? 0;
  }

  getSpendingPolicy(agent: string): PolicyEntry | null {
    return this.policies.get(agent) ?? null;
  }

  // ── BLOCKLIST ──

  blockSeller(buyer: string, seller: string): void {
    if (!this.blocklist.has(buyer)) {
      this.blocklist.set(buyer, new Set());
    }
    this.blocklist.get(buyer)!.add(seller);
  }

  unblockSeller(buyer: string, seller: string): void {
    this.blocklist.get(buyer)?.delete(seller);
  }

  isBlocked(buyer: string, seller: string): boolean {
    return this.blocklist.get(buyer)?.has(seller) ?? false;
  }

  getBlocklist(buyer: string): string[] {
    return [...(this.blocklist.get(buyer) ?? [])];
  }

  // ── SPEND ALERTS ──

  setSpendAlert(agent: string, dailyLimit: number, alertPercent: number = 80, webhook?: string): void {
    this.spendAlerts.set(agent, { threshold: dailyLimit, percent: alertPercent, webhook });
  }

  /**
   * Check if spending alert should fire. Returns alert info or null.
   */
  checkSpendAlert(agent: string): { fired: boolean; spent: number; threshold: number; percent: number; webhook?: string } | null {
    const alert = this.spendAlerts.get(agent);
    if (!alert) return null;

    const today = new Date().toISOString().slice(0, 10);
    const daily = this.dailySpend.get(agent);
    const spent = (daily && daily.date === today) ? daily.amount : 0;
    const triggerAt = alert.threshold * (alert.percent / 100);

    return {
      fired: spent >= triggerAt,
      spent: parseFloat(spent.toFixed(7)),
      threshold: alert.threshold,
      percent: alert.percent,
      webhook: alert.webhook,
    };
  }

  // ── ADMIN: Fleet overview ──

  getAllAgentSpending(): {
    agent: string;
    todaySpent: number;
    totalTxs: number;
    policyStatus: 'custom' | 'default' | 'none';
  }[] {
    const today = new Date().toISOString().slice(0, 10);
    const agents = new Set<string>();

    // Collect all known agents from daily spend + ledger + policies
    for (const key of this.dailySpend.keys()) agents.add(key);
    for (const key of this.spendLedger.keys()) agents.add(key);
    for (const key of this.policies.keys()) agents.add(key);

    return [...agents].map(agent => {
      const daily = this.dailySpend.get(agent);
      const records = this.spendLedger.get(agent) ?? [];
      const hasCustomPolicy = this.policies.has(agent);

      return {
        agent,
        todaySpent: (daily && daily.date === today) ? parseFloat(daily.amount.toFixed(7)) : 0,
        totalTxs: records.length,
        policyStatus: (hasCustomPolicy ? 'custom' : (this.defaultPolicy ? 'default' : 'none')) as 'custom' | 'default' | 'none',
      };
    }).sort((a, b) => b.todaySpent - a.todaySpent); // highest spender first
  }

  get serviceCount(): number {
    return this.services.size;
  }
}

const registry = new InMemoryRegistry();
export default registry;
