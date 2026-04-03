import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from '../src/governance.js';

describe('Input Validation & Edge Cases', () => {
  it('handles zero amount', () => {
    const gov = createGovernor();
    gov.reset();
    const r = gov.evaluate('agent-v1', { amount: 0, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(r.allowed, true);
  });

  it('handles negative amount gracefully', () => {
    const gov = createGovernor();
    gov.reset();
    // Governance treats negative as passing (gateway validates before calling)
    const r = gov.evaluate('agent-v2', { amount: -5, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(r.allowed, true); // gateway rejects first
  });

  it('handles missing fields gracefully', () => {
    const gov = createGovernor();
    gov.reset();
    const r = gov.evaluate('agent-v3', { amount: 1, chain: 'arbitrum' });
    // No protocol = null, but protocolAllowlist check should handle
    assert.ok(r.allowed !== undefined);
  });

  it('handles empty agentId', () => {
    const gov = createGovernor();
    gov.reset();
    const r = gov.evaluate('', { amount: 1, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(r.allowed, true);
    const summary = gov.getSpendSummary('');
    assert.equal(summary.today, 1);
  });

  it('multiple agents dont share budgets', () => {
    const gov = createGovernor({ dailyLimit: 20 });
    gov.reset();
    gov.evaluate('alice', { amount: 15, chain: 'arbitrum', protocol: 'x402' });
    const bob = gov.evaluate('bob', { amount: 15, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(bob.allowed, true); // Bob has his own budget
  });

  it('per-tx cap is exact boundary', () => {
    const gov = createGovernor({ perTxCap: 25 });
    gov.reset();
    const exact = gov.evaluate('agent-b', { amount: 25, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(exact.allowed, true); // $25 == $25 cap, should pass
    const over = gov.evaluate('agent-b2', { amount: 25.01, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(over.allowed, false);
  });

  it('zero slippage passes', () => {
    const gov = createGovernor();
    gov.reset();
    const r = gov.evaluate('agent-s', { amount: 1, chain: 'arbitrum', protocol: 'x402', slippage: 0 });
    assert.equal(r.allowed, true);
  });

  it('exact slippage boundary passes', () => {
    const gov = createGovernor({ maxSlippage: 0.05 });
    gov.reset();
    const r = gov.evaluate('agent-s2', { amount: 1, chain: 'arbitrum', protocol: 'x402', slippage: 0.05 });
    assert.equal(r.allowed, true); // 5% == 5% max
  });
});
