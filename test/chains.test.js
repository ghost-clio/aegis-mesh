import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chains, getChain, allChains } from '../src/chains.js';

describe('Chain Configuration', () => {
  it('has Arbitrum Sepolia', () => {
    const arb = getChain('arbitrum');
    assert.equal(arb.chainId, 421614);
    assert.equal(arb.name, 'Arbitrum Sepolia');
    assert.ok(arb.rpcUrl.includes('arbitrum'));
  });

  it('has XRPL EVM Sidechain', () => {
    const xrpl = getChain('xrplEvm');
    assert.equal(xrpl.chainId, 1440000);
    assert.equal(xrpl.name, 'XRPL EVM Sidechain');
    assert.ok(xrpl.rpcUrl.includes('xrplevm'));
  });

  it('throws on unknown chain', () => {
    assert.throws(() => getChain('bitcoin'), /Unknown chain/);
  });

  it('allChains returns both', () => {
    const all = allChains();
    assert.equal(all.length, 2);
    assert.ok(all.some(c => c.id === 'arbitrum'));
    assert.ok(all.some(c => c.id === 'xrplEvm'));
  });

  it('both chains have required fields', () => {
    for (const chain of allChains()) {
      assert.ok(chain.chainId);
      assert.ok(chain.rpcUrl);
      assert.ok(chain.explorer);
      assert.ok(chain.nativeCurrency);
      assert.ok(chain.settlement);
    }
  });
});
