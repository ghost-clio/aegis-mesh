import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAuditLog } from '../src/audit.js';

describe('Audit Log', () => {
  it('logs entries', () => {
    const log = createAuditLog();
    log.log({ type: 'payment_attempt', buyerId: 'a1', chain: 'arbitrum' });
    log.log({ type: 'payment_settled', buyerId: 'a1', chain: 'arbitrum' });
    assert.equal(log.size(), 2);
  });

  it('filters by type', () => {
    const log = createAuditLog();
    log.log({ type: 'payment_attempt', buyerId: 'a1' });
    log.log({ type: 'policy_update', chain: 'arbitrum' });
    log.log({ type: 'payment_settled', buyerId: 'a1' });
    assert.equal(log.getByType('payment_settled').length, 1);
  });

  it('filters by agent', () => {
    const log = createAuditLog();
    log.log({ type: 'payment_settled', buyerId: 'agent-x' });
    log.log({ type: 'payment_settled', buyerId: 'agent-y' });
    log.log({ type: 'payment_settled', buyerId: 'agent-x' });
    assert.equal(log.getByAgent('agent-x').length, 2);
  });

  it('filters by chain', () => {
    const log = createAuditLog();
    log.log({ type: 'payment_settled', chain: 'arbitrum' });
    log.log({ type: 'payment_settled', chain: 'xrplEvm' });
    log.log({ type: 'payment_settled', chain: 'arbitrum' });
    assert.equal(log.getByChain('xrplEvm').length, 1);
  });

  it('tracks denials', () => {
    const log = createAuditLog();
    log.log({ type: 'payment_attempt', decision: 'approved' });
    log.log({ type: 'payment_attempt', decision: 'denied', reason: 'over limit' });
    assert.equal(log.getDenials().length, 1);
  });

  it('generates stats', () => {
    const log = createAuditLog();
    log.log({ type: 'payment_settled', chain: 'arbitrum' });
    log.log({ type: 'payment_settled', chain: 'xrplEvm' });
    log.log({ type: 'payment_attempt', decision: 'denied' });
    log.log({ type: 'policy_update' });
    const stats = log.getStats();
    assert.equal(stats.payments, 2);
    assert.equal(stats.byChain.arbitrum, 1);
    assert.equal(stats.byChain.xrplEvm, 1);
    assert.equal(stats.policyUpdates, 1);
  });

  it('entries are append-only (immutable)', () => {
    const log = createAuditLog();
    log.log({ type: 'test', data: 'original' });
    const entries = log.getAll();
    entries.push({ type: 'injected' }); // should not affect internal state
    assert.equal(log.size(), 1);
  });
});
