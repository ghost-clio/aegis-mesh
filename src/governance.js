/**
 * Aegis Governance Layer
 * Wraps the mesh gateway with Aegis policy enforcement.
 * Every x402 payment passes through 6-layer policies BEFORE signing.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AEGIS_ROOT = join(__dirname, '..', 'aegis-core');

// Load Aegis policy engine
let policies;
try {
  const policiesPath = join(AEGIS_ROOT, 'src', 'policies.js');
  policies = await import(policiesPath);
} catch (e) {
  console.warn('[governance] Aegis policies not found, using passthrough mode');
  policies = null;
}

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

// Per-agent spend tracking
const agentSpend = new Map();

export function createGovernor(customPolicies = {}) {
  const policy = { ...DEFAULT_POLICIES, ...customPolicies };

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

      // Layer 4: Protocol allowlist
      if (protocol && !policy.protocolAllowlist.includes(protocol)) {
        return { allowed: false, reason: `Protocol not allowed: ${protocol}`, layer: 4 };
      }

      // Layer 5: Slippage guard
      if (slippage && slippage > policy.maxSlippage) {
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
      Object.assign(policy, updates);
      return policy;
    },
  };
}
