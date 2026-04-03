/**
 * Aegis Governance Layer
 * Wraps the mesh gateway with Aegis policy enforcement.
 * Every x402 payment passes through 6-layer policies BEFORE signing.
 */

/**
 * Aegis governance integrates with aegis-core/src/policies.js when available.
 * If aegis-core is not present, runs standalone with built-in 6-layer enforcement.
 */

/**
 * 6-layer policy stack (from Aegis):
 * 1. Daily spending limit
 * 2. Per-transaction cap
 * 3. Chain allowlist (CAIP-2)
 * 4. Protocol allowlist
 * 5. Slippage guard
 * 6. Cooldown period
 */
const DEFAULT_POLICIES = {
  dailyLimit: 100,        // $100/day per agent
  perTxCap: 25,           // $25 max per transaction
  chainAllowlist: ['arbitrum', 'xrplEvm'],
  protocolAllowlist: ['x402', 'mpp'],
  maxSlippage: 0.05,      // 5%
  cooldownMs: 5000,       // 5s between large txns (>$10)
};

export function createGovernor(customPolicies = {}) {
  const policy = { ...DEFAULT_POLICIES, ...customPolicies };
  // Per-governor spend tracking (isolated per instance — Nemo audit fix)
  const agentSpend = new Map();

  return {
    policy,

    /**
     * Evaluate a proposed transaction against all 6 policy layers.
     * Returns { allowed, reason, layer } 
     */
    evaluate(agentId, tx) {
      const { amount, chain, protocol, slippage } = tx;
      const now = Date.now();

      // Layer 1: Daily spending limit
      const today = new Date().toISOString().slice(0, 10);
      const key = `${agentId}:${today}`;
      const spent = agentSpend.get(key) || 0;
      if (spent + amount > policy.dailyLimit) {
        return { allowed: false, reason: `Daily limit exceeded: $${spent.toFixed(2)} + $${amount.toFixed(2)} > $${policy.dailyLimit}`, layer: 1 };
      }

      // Layer 2: Per-transaction cap
      if (amount > policy.perTxCap) {
        return { allowed: false, reason: `Per-tx cap exceeded: $${amount.toFixed(2)} > $${policy.perTxCap}`, layer: 2 };
      }

      // Layer 3: Chain allowlist
      if (!policy.chainAllowlist.includes(chain)) {
        return { allowed: false, reason: `Chain not allowed: ${chain}`, layer: 3 };
      }

      // Layer 4: Protocol allowlist (empty string = missing = deny)
      const proto = protocol || '';
      if (!proto || !policy.protocolAllowlist.includes(proto)) {
        return { allowed: false, reason: `Protocol not allowed: ${proto || '(empty)'}`, layer: 4 };
      }

      // Layer 5: Slippage guard (explicit 0 is fine, undefined skips, >max denied)
      if (typeof slippage === 'number' && slippage > policy.maxSlippage) {
        return { allowed: false, reason: `Slippage too high: ${(slippage * 100).toFixed(1)}% > ${(policy.maxSlippage * 100).toFixed(1)}%`, layer: 5 };
      }

      // Layer 6: Cooldown
      const lastLargeTx = agentSpend.get(`${agentId}:lastLarge`) || 0;
      if (amount > 10 && (now - lastLargeTx) < policy.cooldownMs) {
        return { allowed: false, reason: `Cooldown active: ${policy.cooldownMs}ms between large txns`, layer: 6 };
      }

      // All layers passed
      agentSpend.set(key, spent + amount);
      if (amount > 10) agentSpend.set(`${agentId}:lastLarge`, now);

      return { allowed: true, reason: 'All 6 policy layers passed', layer: 0 };
    },

    /**
     * Get agent spending summary
     */
    getSpendSummary(agentId) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `${agentId}:${today}`;
      return {
        agentId,
        today: agentSpend.get(key) || 0,
        dailyLimit: policy.dailyLimit,
        remaining: policy.dailyLimit - (agentSpend.get(key) || 0),
      };
    },

    /**
     * Reset all spend tracking (for testing)
     */
    reset() {
      agentSpend.clear();
    },

    /**
     * Update policy dynamically (NL policy editor support)
     */
    updatePolicy(updates) {
      // Sanitize: only allow known policy keys (prevent prototype pollution)
      const allowed = ['dailyLimit', 'perTxCap', 'chainAllowlist', 'protocolAllowlist', 'maxSlippage', 'cooldownMs'];
      for (const key of Object.keys(updates)) {
        if (allowed.includes(key)) policy[key] = updates[key];
      }
      return policy;
    },
  };
}
