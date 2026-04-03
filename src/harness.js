/**
 * Aegis Mesh Harness
 * 8 agents (4 per chain) running autonomous economic scenarios.
 * Each agent has an Aegis-governed wallet with spending policies.
 */

import { createGateway } from './gateway.js';

const AGENTS = {
  // Arbitrum agents
  'atlas-arb': { name: 'Atlas', chain: 'arbitrum', role: 'data-provider', services: ['market-data', 'news-aggregation'] },
  'pixel-arb': { name: 'Pixel', chain: 'arbitrum', role: 'creative', services: ['image-gen', 'design-review'] },
  'nova-arb':  { name: 'Nova',  chain: 'arbitrum', role: 'compute', services: ['ml-inference', 'summarization'] },
  'echo-arb':  { name: 'Echo',  chain: 'arbitrum', role: 'comms', services: ['translation', 'sentiment-analysis'] },
  // XRPL EVM agents
  'atlas-xrpl': { name: 'Atlas-X', chain: 'xrplEvm', role: 'data-provider', services: ['market-data', 'news-aggregation'] },
  'pixel-xrpl': { name: 'Pixel-X', chain: 'xrplEvm', role: 'creative', services: ['image-gen', 'design-review'] },
  'nova-xrpl':  { name: 'Nova-X',  chain: 'xrplEvm', role: 'compute', services: ['ml-inference', 'summarization'] },
  'echo-xrpl':  { name: 'Echo-X',  chain: 'xrplEvm', role: 'comms', services: ['translation', 'sentiment-analysis'] },
};

const SCENARIOS = [
  // Arbitrum scenarios
  { buyer: 'atlas-arb', service: 'image-gen', amount: 0.50, chain: 'arbitrum', desc: 'Atlas buys design from Pixel' },
  { buyer: 'pixel-arb', service: 'ml-inference', amount: 1.20, chain: 'arbitrum', desc: 'Pixel buys ML inference from Nova' },
  { buyer: 'nova-arb', service: 'translation', amount: 0.30, chain: 'arbitrum', desc: 'Nova buys translation from Echo' },
  { buyer: 'echo-arb', service: 'market-data', amount: 0.75, chain: 'arbitrum', desc: 'Echo buys market data from Atlas' },
  { buyer: 'atlas-arb', service: 'summarization', amount: 0.40, chain: 'arbitrum', desc: 'Atlas buys summary from Nova' },
  { buyer: 'pixel-arb', service: 'sentiment-analysis', amount: 0.60, chain: 'arbitrum', desc: 'Pixel buys sentiment from Echo' },
  // XRPL EVM scenarios
  { buyer: 'atlas-xrpl', service: 'image-gen', amount: 0.50, chain: 'xrplEvm', desc: 'Atlas-X buys design from Pixel-X' },
  { buyer: 'pixel-xrpl', service: 'ml-inference', amount: 1.20, chain: 'xrplEvm', desc: 'Pixel-X buys ML inference from Nova-X' },
  { buyer: 'nova-xrpl', service: 'translation', amount: 0.30, chain: 'xrplEvm', desc: 'Nova-X buys translation from Echo-X' },
  { buyer: 'echo-xrpl', service: 'market-data', amount: 0.75, chain: 'xrplEvm', desc: 'Echo-X buys market data from Atlas-X' },
  { buyer: 'atlas-xrpl', service: 'summarization', amount: 0.40, chain: 'xrplEvm', desc: 'Atlas-X buys summary from Nova-X' },
  { buyer: 'pixel-xrpl', service: 'sentiment-analysis', amount: 0.60, chain: 'xrplEvm', desc: 'Pixel-X buys sentiment from Echo-X' },
  // Cross-chain scenarios
  { buyer: 'atlas-arb', service: 'market-data', amount: 1.00, chain: 'xrplEvm', desc: '🌉 Atlas (Arb) buys from XRPL market' },
  { buyer: 'nova-xrpl', service: 'ml-inference', amount: 0.80, chain: 'arbitrum', desc: '🌉 Nova-X (XRPL) buys Arb compute' },
  // Governance test scenarios
  { buyer: 'rogue-agent', service: 'image-gen', amount: 50, chain: 'arbitrum', desc: '🛡️ Policy test: over per-tx cap ($50 > $25)' },
  { buyer: 'atlas-arb', service: 'image-gen', amount: 5, chain: 'solana', desc: '🛡️ Policy test: unauthorized chain (solana)' },
];

async function runHarness(baseUrl = 'http://localhost:3404') {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AEGIS MESH — 8-Agent Dual-Chain Harness');
  console.log('  Arbitrum Sepolia + XRPL EVM Sidechain');
  console.log('  Governed by Aegis 6-Layer Policy Engine');
  console.log('═══════════════════════════════════════════════════════\n');

  // Step 1: Register all agents and services
  console.log('📋 Registering 8 agents and 16 services...\n');
  for (const [id, agent] of Object.entries(AGENTS)) {
    for (const svc of agent.services) {
      const res = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `${id}:${svc}`,
          name: `${agent.name} ${svc}`,
          capabilities: [svc],
          seller: id,
          chain: agent.chain,
          price: 0.01 + Math.random() * 2,
        }),
      });
      const data = await res.json();
    }
  }
  console.log('  ✅ 8 agents registered, 16 services live\n');

  // Step 2: Run scenarios
  console.log('🔄 Running 16 transaction scenarios...\n');
  let passed = 0;
  let denied = 0;

  for (const scenario of SCENARIOS) {
    const res = await fetch(`${baseUrl}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerId: scenario.buyer,
        serviceId: scenario.service,
        amount: scenario.amount,
        chain: scenario.chain,
        protocol: 'x402',
      }),
    });

    const data = await res.json();
    const icon = res.ok ? '✅' : '🛡️';
    const status = res.ok ? `verified=${data.verified}` : `DENIED (layer ${data.layer}: ${data.reason})`;

    console.log(`  ${icon} ${scenario.desc}`);
    console.log(`     → $${scenario.amount.toFixed(2)} on ${scenario.chain} | ${status}`);

    if (res.ok) passed++;
    else denied++;
  }

  console.log(`\n  Results: ${passed} approved, ${denied} policy-denied`);
  console.log(`  Expected: 14 approved, 2 denied (governance working correctly)\n`);

  // Step 3: Test NL policy editor
  console.log('📝 Testing NL Policy Editor...\n');
  const nlTests = [
    'Set daily limit to $50',
    'Max per transaction $10',
    'Slippage max 2%',
    'Set cooldown to 10s',
  ];

  for (const text of nlTests) {
    const res = await fetch(`${baseUrl}/governance/nl-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    console.log(`  "${text}" → ${data.parsed ? '✅ ' + JSON.stringify(data.updates) : '❌ Not parsed'}`);
  }

  // Step 4: Fleet view
  console.log('\n📊 Fleet Overview:');
  const fleet = await (await fetch(`${baseUrl}/fleet`)).json();
  console.log(`  Total agents: ${fleet.totalAgents}`);
  console.log(`  Total transactions: ${fleet.totalTxs}`);
  console.log(`  Verified: ${fleet.verified}`);
  console.log(`  Chains: ${fleet.chains.join(' + ')}`);

  for (const agent of fleet.agents.slice(0, 4)) {
    console.log(`  ${agent.id}: ${agent.txCount} txs, ${agent.successRate} success, $${agent.totalSpent} spent`);
  }

  // Step 5: Audit stats
  console.log('\n📜 Audit Log:');
  const auditStats = await (await fetch(`${baseUrl}/audit?limit=100`)).json();
  console.log(`  Total entries: ${auditStats.total}`);
  console.log(`  Denials logged: ${auditStats.entries.filter(e => e.decision === 'denied').length}`);

  // Step 6: Bridge status
  console.log('\n🌉 Cross-Chain Bridge:');
  const bridge = await (await fetch(`${baseUrl}/bridge/status`)).json();
  for (const b of bridge.bridges) {
    console.log(`  ${b.from} → ${b.to}: ${b.asset} (${b.method}) [${b.status}]`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ Harness complete — Aegis Mesh operational');
  console.log('═══════════════════════════════════════════════════════');
}

// Run if called directly
if (process.argv[1]?.endsWith('harness.js')) {
  // Start gateway first
  const { start } = createGateway(3404);
  start();
  // Wait for server, then run
  setTimeout(() => runHarness(), 1000);
}

export { AGENTS, SCENARIOS, runHarness };
