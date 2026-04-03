import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../src/gateway.js';

describe('Aegis Mesh Gateway (HTTP)', () => {
  let server, port;

  before(async () => {
    const gw = createGateway(0);
    server = gw.app.listen(0);
    port = server.address().port;
  });

  after(() => { server?.close(); });

  it('health returns dual-chain config with 16 features', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.chains.length, 2);
    assert.equal(data.governance, 'aegis-6-layer');
    assert.ok(data.features.includes('dual_chain'));
    assert.ok(data.features.includes('aegis_governance'));
    assert.ok(data.features.includes('nl_policy_editor'));
    assert.ok(data.features.includes('moonpay_bridge'));
    assert.equal(data.features.length, 16);
  });

  it('registers service', async () => {
    const res = await fetch(`http://localhost:${port}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test-svc', name: 'Test Service', chain: 'arbitrum' }),
    });
    const data = await res.json();
    assert.equal(data.registered, 'test-svc');
  });

  it('discovers services', async () => {
    const res = await fetch(`http://localhost:${port}/discover`);
    const data = await res.json();
    assert.ok(data.count >= 1);
  });

  it('approves valid payment', async () => {
    const res = await fetch(`http://localhost:${port}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: 'test-buyer', serviceId: 'test-svc', amount: 5, chain: 'arbitrum', protocol: 'x402' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.governance, 'approved');
    assert.ok(data.txId);
  });

  it('denies payment over per-tx cap', async () => {
    const res = await fetch(`http://localhost:${port}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: 'rogue', serviceId: 'test-svc', amount: 50, chain: 'arbitrum', protocol: 'x402' }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.layer, 2);
    assert.equal(data.governance, 'aegis');
  });

  it('denies payment on unauthorized chain', async () => {
    const res = await fetch(`http://localhost:${port}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: 'test', serviceId: 'test-svc', amount: 5, chain: 'solana', protocol: 'x402' }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.layer, 3);
  });

  it('rejects missing buyerId', async () => {
    const res = await fetch(`http://localhost:${port}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: 'test-svc', amount: 5 }),
    });
    assert.equal(res.status, 400);
  });

  it('rejects negative amount', async () => {
    const res = await fetch(`http://localhost:${port}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: 'test', serviceId: 'test-svc', amount: -5 }),
    });
    assert.equal(res.status, 400);
  });

  it('NL policy editor parses daily limit', async () => {
    const res = await fetch(`http://localhost:${port}/governance/nl-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Set daily limit to $75' }),
    });
    const data = await res.json();
    assert.equal(data.parsed, true);
    assert.equal(data.updates.dailyLimit, 75);
  });

  it('fleet view returns agents', async () => {
    const res = await fetch(`http://localhost:${port}/fleet`);
    const data = await res.json();
    assert.ok(data.totalTxs >= 0);
    assert.ok(data.chains.includes('arbitrum'));
  });

  it('audit log returns entries', async () => {
    const res = await fetch(`http://localhost:${port}/audit`);
    const data = await res.json();
    assert.ok(data.total >= 0);
    assert.ok(Array.isArray(data.entries));
  });

  it('CSV export returns text/csv', async () => {
    const res = await fetch(`http://localhost:${port}/audit/csv`);
    assert.ok(res.headers.get('content-type').includes('text/csv'));
  });

  it('bridge status returns both routes', async () => {
    const res = await fetch(`http://localhost:${port}/bridge/status`);
    const data = await res.json();
    assert.equal(data.bridges.length, 2);
    assert.equal(data.bridges[0].from, 'arbitrum');
    assert.equal(data.bridges[1].from, 'xrplEvm');
  });

  it('XRPL EVM payment works', async () => {
    const res = await fetch(`http://localhost:${port}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: 'xrpl-buyer', serviceId: 'xrpl-svc', amount: 2, chain: 'xrplEvm', protocol: 'x402' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.chain, 'xrplEvm');
  });
});
