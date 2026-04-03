import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from '../src/governance.js';

describe('Aegis 6-Layer Governance', () => {
  let gov;

  beforeEach(() => {
    gov = createGovernor({
      dailyLimit: 100,
      perTxCap: 25,
      chainAllowlist: ['arbitrum', 'xrplEvm'],
      protocolAllowlist: ['x402', 'mpp'],
      maxSlippage: 0.05,
      cooldownMs: 100,
    });
    gov.reset();
  });

  it('approves valid transaction', () => {
    const result = gov.evaluate('agent-1', { amount: 5, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(result.allowed, true);
    assert.equal(result.layer, 0);
  });

  it('Layer 1: denies over daily limit', () => {
    // Spend up to limit
    for (let i = 0; i < 10; i++) {
      gov.evaluate('agent-2', { amount: 10, chain: 'arbitrum', protocol: 'x402' });
    }
    const result = gov.evaluate('agent-2', { amount: 5, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 1);
  });

  it('Layer 2: denies over per-tx cap', () => {
    const result = gov.evaluate('agent-3', { amount: 30, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 2);
  });

  it('Layer 3: denies unauthorized chain', () => {
    const result = gov.evaluate('agent-4', { amount: 5, chain: 'solana', protocol: 'x402' });
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 3);
  });

  it('Layer 4: denies unauthorized protocol', () => {
    const result = gov.evaluate('agent-5', { amount: 5, chain: 'arbitrum', protocol: 'unknown' });
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 4);
  });

  it('Layer 5: denies excessive slippage', () => {
    const result = gov.evaluate('agent-6', { amount: 5, chain: 'arbitrum', protocol: 'x402', slippage: 0.10 });
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 5);
  });

  it('Layer 6: denies during cooldown', () => {
    gov.evaluate('agent-7', { amount: 15, chain: 'arbitrum', protocol: 'x402' }); // large tx
    const result = gov.evaluate('agent-7', { amount: 15, chain: 'arbitrum', protocol: 'x402' }); // immediate retry
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 6);
  });

  it('tracks spending per agent per day', () => {
    gov.evaluate('agent-8', { amount: 10, chain: 'arbitrum', protocol: 'x402' });
    gov.evaluate('agent-8', { amount: 5, chain: 'xrplEvm', protocol: 'x402' });
    const summary = gov.getSpendSummary('agent-8');
    assert.equal(summary.today, 15);
    assert.equal(summary.remaining, 85);
  });

  it('allows XRPL EVM chain', () => {
    const result = gov.evaluate('agent-9', { amount: 5, chain: 'xrplEvm', protocol: 'x402' });
    assert.equal(result.allowed, true);
  });

  it('allows MPP protocol', () => {
    const result = gov.evaluate('agent-10', { amount: 5, chain: 'arbitrum', protocol: 'mpp' });
    assert.equal(result.allowed, true);
  });

  it('dynamic policy update works', () => {
    gov.updatePolicy({ perTxCap: 5 });
    const result = gov.evaluate('agent-11', { amount: 10, chain: 'arbitrum', protocol: 'x402' });
    assert.equal(result.allowed, false);
    assert.equal(result.layer, 2);
  });
});
