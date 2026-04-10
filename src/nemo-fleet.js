/**
 * Aegis Mesh Nemotron Bot Fleet
 * 8 agents (4 per chain) powered by Nemotron 120B (free).
 * Real autonomous transactions through the Aegis governance engine.
 */

const GATEWAY = process.env.AEGIS_GATEWAY || 'http://localhost:3404';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const NEMO_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

const AGENTS = [
  // Arbitrum agents
  { id: 'atlas-arb', name: 'Atlas', chain: 'arbitrum', role: 'data-provider',
    services: ['market-data', 'news-aggregation'],
    buyPatterns: ['image-gen', 'sentiment-analysis', 'ml-inference'],
    personality: 'You are Atlas, a data aggregation agent on Arbitrum. You compile market data and news feeds for other agents.' },
  { id: 'pixel-arb', name: 'Pixel', chain: 'arbitrum', role: 'creative',
    services: ['image-gen', 'design-review'],
    buyPatterns: ['market-data', 'code-review', 'translation'],
    personality: 'You are Pixel, a creative agent on Arbitrum. You generate images and review designs for the mesh.' },
  { id: 'nova-arb', name: 'Nova', chain: 'arbitrum', role: 'compute',
    services: ['ml-inference', 'summarization'],
    buyPatterns: ['market-data', 'sentiment-analysis', 'design-review'],
    personality: 'You are Nova, a compute agent on Arbitrum. You run ML inference and summarization tasks.' },
  { id: 'echo-arb', name: 'Echo', chain: 'arbitrum', role: 'comms',
    services: ['translation', 'sentiment-analysis'],
    buyPatterns: ['market-data', 'image-gen', 'ml-inference'],
    personality: 'You are Echo, a communications agent on Arbitrum. You handle translation and sentiment analysis.' },
  // XRPL EVM agents
  { id: 'atlas-xrpl', name: 'Atlas-X', chain: 'xrplEvm', role: 'data-provider',
    services: ['market-data', 'news-aggregation'],
    buyPatterns: ['image-gen', 'translation', 'ml-inference'],
    personality: 'You are Atlas-X, a data provider on XRPL EVM. You aggregate cross-chain market intelligence.' },
  { id: 'pixel-xrpl', name: 'Pixel-X', chain: 'xrplEvm', role: 'creative',
    services: ['image-gen', 'design-review'],
    buyPatterns: ['market-data', 'summarization', 'sentiment-analysis'],
    personality: 'You are Pixel-X, a creative agent on XRPL EVM. You create visual content and review designs.' },
  { id: 'nova-xrpl', name: 'Nova-X', chain: 'xrplEvm', role: 'compute',
    services: ['ml-inference', 'summarization'],
    buyPatterns: ['news-aggregation', 'image-gen', 'translation'],
    personality: 'You are Nova-X, a compute agent on XRPL EVM. You handle heavy ML workloads across chains.' },
  { id: 'echo-xrpl', name: 'Echo-X', chain: 'xrplEvm', role: 'comms',
    services: ['translation', 'sentiment-analysis'],
    buyPatterns: ['market-data', 'ml-inference', 'design-review'],
    personality: 'You are Echo-X, a communications agent on XRPL EVM. You bridge language barriers in the mesh.' },
];

// ── Local fallback reasons when Nemo is rate-limited ──
const FALLBACK_REASONS = {
  'code-review': [
    'Need audit of governance module before mainnet deploy.',
    'Security review on cross-chain bridge logic requested.',
    'Checking smart contract for reentrancy vulnerabilities.',
    'Reviewing policy engine edge cases for compliance.',
  ],
  'web-search': [
    'Fetching latest gas prices across both chains for optimization.',
    'Researching current DeFi yield opportunities for treasury.',
    'Looking up token metadata for new service listings.',
    'Scanning for governance proposal updates on-chain.',
  ],
  'market-data': [
    'Need real-time price feeds for cross-chain settlement.',
    'Pulling 24h volume data for fleet spending analysis.',
    'Checking slippage conditions before large transfer.',
    'Querying oracle prices for policy threshold calibration.',
  ],
  'image-gen': [
    'Generating agent identity badge for mesh registration.',
    'Creating visualization of fleet transaction topology.',
    'Rendering governance decision tree for audit report.',
    'Producing dashboard chart for cross-chain activity.',
  ],
  'summarization': [
    'Condensing 200-entry audit log for fleet admin review.',
    'Summarizing daily governance decisions for compliance report.',
    'Distilling cross-chain transaction patterns for optimization.',
    'Creating executive briefing on mesh health metrics.',
  ],
  'translation': [
    'Translating service descriptions for multi-locale mesh nodes.',
    'Converting governance policy to human-readable format.',
    'Bridging protocol documentation across chain ecosystems.',
    'Localizing agent capabilities for international mesh discovery.',
  ],
};
const FALLBACK_GENERIC = [
  'Executing routine inter-agent service request within mesh.',
  'Processing capability exchange through Aegis governance layer.',
  'Fulfilling mesh service obligation per spending policy.',
  'Completing scheduled agent-to-agent transaction cycle.',
];
let nemoRateLimited = false;

function localFallbackReason(capability) {
  const pool = FALLBACK_REASONS[capability] || FALLBACK_GENERIC;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Nemotron call ──
async function callNemo(prompt, maxTokens = 150, capability = '') {
  // If already rate limited this session, use local fallback immediately
  if (nemoRateLimited) return localFallbackReason(capability);
  if (!OPENROUTER_KEY) return localFallbackReason(capability);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://ghost-clio.github.io/aegis-mesh/',
        'X-Title': 'Aegis Mesh Agent Fleet',
      },
      body: JSON.stringify({
        model: NEMO_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    if (!resp.ok) {
      const err = await resp.text();
      if (resp.status === 429) {
        console.log('[Nemo] Rate limited — switching to local fallback reasons for this session.');
        nemoRateLimited = true;
        // Reset after 1 hour in case limit resets
        setTimeout(() => { nemoRateLimited = false; console.log('[Nemo] Rate limit cooldown expired, will retry API.'); }, 3600000);
        return localFallbackReason(capability);
      }
      console.error(`[Nemo] API error ${resp.status}: ${err.slice(0, 200)}`);
      return localFallbackReason(capability);
    }
    
    // Successfully got a response — make sure we're not flagged
    nemoRateLimited = false;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || localFallbackReason(capability);
  } catch (err) {
    if (err.name === 'AbortError') return localFallbackReason(capability);
    return localFallbackReason(capability);
  }
}

// ── Register services on gateway ──
async function registerServices() {
  let count = 0;
  for (const agent of AGENTS) {
    for (const svc of agent.services) {
      try {
        const resp = await fetch(`${GATEWAY}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `${agent.id}:${svc}`,
            name: `${agent.name} ${svc}`,
            capabilities: [svc],
            seller: agent.id,
            chain: agent.chain,
            price: 0.001 + Math.random() * 0.008, // $0.001 - $0.009
          }),
        });
        if (resp.ok) count++;
      } catch {}
    }
  }
  return count;
}

// ── Buy a service through Aegis governance ──
async function buyService(buyerId, serviceId, amount, chain, nemoReason) {
  try {
    const resp = await fetch(`${GATEWAY}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerId,
        serviceId,
        amount,
        chain,
        protocol: 'x402',
        metadata: { nemoReason: nemoReason.slice(0, 200) },
      }),
    });
    
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, ...data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Single agent transaction cycle ──
async function runAgentCycle(agent) {
  const capability = agent.buyPatterns[Math.floor(Math.random() * agent.buyPatterns.length)];
  
  // Find a seller for this capability (not ourselves)
  const sellers = AGENTS.filter(a => 
    a.id !== agent.id && a.services.includes(capability)
  );
  if (sellers.length === 0) return;
  
  const seller = sellers[Math.floor(Math.random() * sellers.length)];
  const serviceId = `${seller.id}:${capability}`;
  const amount = 0.001 + Math.random() * 0.008; // micro amounts
  
  // Decide chain — sometimes cross-chain
  let chain = agent.chain;
  if (Math.random() < 0.15) {
    // 15% chance of cross-chain transaction
    chain = agent.chain === 'arbitrum' ? 'xrplEvm' : 'arbitrum';
  }
  
  // Ask Nemotron why this agent wants this service
  const prompt = `${agent.personality}\n\nYou want to buy "${capability}" from ${seller.name} (${seller.role}) for $${amount.toFixed(4)}. ${chain !== agent.chain ? 'This is a CROSS-CHAIN transaction.' : ''}\nIn 1-2 sentences, what specific task do you need done? Be concrete.`;
  
  const reason = await callNemo(prompt, 80, capability);
  
  console.log(`  [${agent.name}] → ${seller.name} | ${capability} | $${amount.toFixed(4)} | ${chain}${chain !== agent.chain ? ' 🌉' : ''}`);
  console.log(`    "${reason.slice(0, 120)}"`);
  
  const result = await buyService(agent.id, serviceId, parseFloat(amount.toFixed(4)), chain, reason);
  
  if (!result.ok) {
    console.log(`    ❌ Denied (layer ${result.layer || '?'}): ${result.reason || result.error}`);
  } else {
    console.log(`    ✅ tx=${result.txId?.slice(0, 20)}... | verified=${result.verified} | gov=${result.governance}`);
  }
}

// ── Main loop ──
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Aegis Mesh — Nemotron Bot Fleet');
  console.log(`  ${AGENTS.length} agents (4 Arbitrum + 4 XRPL EVM)`);
  console.log(`  Gateway: ${GATEWAY}`);
  console.log(`  Model: ${NEMO_MODEL} (FREE)`);
  console.log(`  Governance: Aegis 6-Layer Policy Engine`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Check gateway health
  try {
    const health = await (await fetch(`${GATEWAY}/health`)).json();
    console.log(`Gateway: ${health.status} | ${health.features?.length || 0} features\n`);
  } catch {
    console.error('❌ Gateway not reachable. Starting it...');
    // Import and start gateway
    const { createGateway } = await import('./gateway.js');
    const { start } = createGateway(3404);
    start();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Register all services
  console.log('📋 Registering services...');
  const count = await registerServices();
  console.log(`  ✅ ${count} services registered\n`);
  
  // Transaction loop
  const INTERVAL = parseInt(process.env.CYCLE_INTERVAL || '45000'); // 45s default
  const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || '0');
  let cycle = 0;
  
  console.log(`🔄 Starting (interval: ${INTERVAL/1000}s)...\n`);
  
  const runCycle = async () => {
    cycle++;
    console.log(`\n── Cycle ${cycle} [${new Date().toISOString()}] ──`);
    
    // Re-register services if gateway was restarted
    try {
      const health = await (await fetch(`${GATEWAY}/health`)).json();
      if (health.services === 0) {
        console.log('  [Re-registering — gateway was restarted]');
        await registerServices();
      }
    } catch {}
    
    // 2-4 agents transact per cycle
    const shuffled = [...AGENTS].sort(() => Math.random() - 0.5);
    const active = shuffled.slice(0, 2 + Math.floor(Math.random() * 3));
    
    for (const agent of active) {
      await runAgentCycle(agent);
      // Small delay between agents to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Every 7th cycle: policy violation test
    if (cycle % 7 === 0) {
      console.log(`  [GOVERNANCE TEST] Over-limit attempt...`);
      const rogue = AGENTS[0];
      const result = await buyService(rogue.id, `${AGENTS[1].id}:${AGENTS[1].services[0]}`, 50.0, 'arbitrum', 'Testing Aegis governance enforcement');
      if (!result.ok) {
        console.log(`    🛡️ Aegis blocked: layer ${result.layer} — ${result.reason}`);
      }
    }
    
    // Every 10th cycle: cross-chain burst
    if (cycle % 10 === 0) {
      console.log(`  [CROSS-CHAIN BURST] 3 cross-chain txs...`);
      for (let i = 0; i < 3; i++) {
        const arb = AGENTS.filter(a => a.chain === 'arbitrum')[i % 4];
        const xrpl = AGENTS.filter(a => a.chain === 'xrplEvm')[i % 4];
        const amount = 0.002 + Math.random() * 0.005;
        await buyService(arb.id, `${xrpl.id}:${xrpl.services[0]}`, parseFloat(amount.toFixed(4)), 'xrplEvm', `Cross-chain ${arb.name}→${xrpl.name}`);
        console.log(`    🌉 ${arb.name} → ${xrpl.name} | $${amount.toFixed(4)}`);
      }
    }
    
    if (MAX_CYCLES > 0 && cycle >= MAX_CYCLES) {
      console.log(`\n✅ Completed ${MAX_CYCLES} cycles.`);
      process.exit(0);
    }
  };
  
  await runCycle();
  setInterval(runCycle, INTERVAL);
}

main().catch(err => {
  console.error('Fleet fatal error:', err);
  process.exit(1);
});
