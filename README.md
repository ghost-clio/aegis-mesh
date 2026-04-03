# Aegis Mesh — Governed Multi-Agent Economy

> 8 agents. 2 chains. 6 policy layers. Zero blank checks.

[![Tests](https://img.shields.io/badge/mesh_tests-45%20passing-brightgreen)]()
[![Aegis Core](https://img.shields.io/badge/aegis_core-66%20passing-brightgreen)]()
[![OWS](https://img.shields.io/badge/OWS-v0.3-blue)]()
[![MoonPay CLI](https://img.shields.io/badge/MoonPay%20CLI-v1.12-purple)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🔗 **[Live Dashboard](https://ghost-clio.github.io/aegis-mesh/)** · **[Aegis Core](https://github.com/ghost-clio/aegis-agent)** · **[OWS Hackathon](https://hackathon.openwallet.sh)**

## The Problem

You can give an agent a wallet. But can you give 8 agents wallets across 2 chains and sleep at night?

Current agent wallets are single-chain, ungoverned, and blind — one rogue agent drains everything, and there's no audit trail, no cross-chain coordination, and no human-readable policy controls.

## The Solution

**Aegis Mesh** = [Aegis](https://github.com/ghost-clio/aegis-agent) governance engine + dual-chain x402 mesh + MoonPay CLI bridging.

Every payment passes through **6 policy layers** before signing. Every transaction lands in an **append-only audit log**. Every agent has a **scoped budget** enforced in real time. Policies are updated via **natural language** — no code changes needed.

```
┌─────────────────────────────────────────────────────────────────┐
│                      AEGIS MESH GATEWAY                         │
│                                                                  │
│  ┌─────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │ Aegis Vault  │   │ 6-Layer Policy   │   │  MoonPay CLI    │  │
│  │ (OWS keys)   │   │ Engine           │   │  (Bridges)      │  │
│  │ AES-256-GCM  │   │ 1. Daily limit   │   │  Fiat on-ramp   │  │
│  │ Key isolation │   │ 2. Per-tx cap    │   │  USDC ↔ RLUSD   │  │
│  │ Multi-chain   │   │ 3. Chain allow   │   │  17 skills      │  │
│  └─────────────┘   │ 4. Protocol allow │   └─────────────────┘  │
│                      │ 5. Slippage guard│                         │
│                      │ 6. Cooldown      │                         │
│                      └──────────────────┘                         │
│                               │                                   │
│         ┌─────────────────────┼─────────────────────┐            │
│         ▼                     ▼                     ▼            │
│   ┌──────────┐          ┌──────────┐          ┌──────────┐      │
│   │ Arbitrum │◄────────►│ XRPL EVM │◄────────►│ 🌉 Bridge│      │
│   │ 4 agents │          │ 4 agents │          │ MoonPay  │      │
│   └──────────┘          └──────────┘          └──────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone https://github.com/ghost-clio/aegis-mesh.git
cd aegis-mesh
npm install

# Run tests (23 mesh + 66 Aegis Core)
npm test

# Run the 8-agent harness
node src/harness.js

# Open the dashboard
open docs/index.html
```

## What It Does

### Dual-Chain x402 Mesh
- **Arbitrum Sepolia** (chain 421614) — 4 agents transacting via x402 micropayments
- **XRPL EVM Sidechain** (chain 1440000) — 4 agents on Ripple's EVM, same gateway
- **Cross-chain scenarios** — agents on Arbitrum buy services from XRPL agents and vice versa
- Same 16 features work on both chains: service discovery, reputation, escrow, fleet admin

### Aegis 6-Layer Governance
Every payment passes through all 6 layers:

| Layer | Check | Default |
|-------|-------|---------|
| 1 | Daily spending limit | $100/day |
| 2 | Per-transaction cap | $25/tx |
| 3 | Chain allowlist (CAIP-2) | Arbitrum + XRPL |
| 4 | Protocol allowlist | x402, MPP |
| 5 | Slippage guard | 5% max |
| 6 | Cooldown period | 5s between large txns |

Deny at **any** layer → transaction blocked, logged to audit, agent notified.

### Natural Language Policy Editor
Update policies in plain English:
```
"Set daily limit to $50"     → { dailyLimit: 50 }
"Max per transaction $10"    → { perTxCap: 10 }
"Slippage max 2%"            → { maxSlippage: 0.02 }
"Set cooldown to 10s"        → { cooldownMs: 10000 }
```

### MoonPay CLI Bridge
- Fiat on-ramp: USD → USDC (Arbitrum) via MoonPay
- Cross-chain bridge: USDC (Arbitrum) ↔ RLUSD (XRPL EVM) via MoonPay CLI
- 17 MoonPay skills available to agents

### 16 Gateway Features
`dual_chain` · `x402_payments` · `aegis_governance` · `spending_policies` · `service_discovery` · `reputation` · `blocklist` · `rate_limiting` · `fleet_admin` · `escrow` · `csv_export` · `audit_log` · `nl_policy_editor` · `moonpay_bridge` · `fiat_onramp` · `cross_chain`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Gateway status, chains, feature list |
| `/register` | POST | Register agent + services |
| `/discover` | GET | Find services by capability/chain |
| `/pay` | POST | Execute governed x402 payment |
| `/governance/status` | GET | Current policy configuration |
| `/governance/spend/:agentId` | GET | Agent spending summary |
| `/governance/policy` | POST | Update policy programmatically |
| `/governance/nl-policy` | POST | Update policy via natural language |
| `/fleet` | GET | All agents, reputation, spending |
| `/audit` | GET | Append-only audit log |
| `/audit/csv` | GET | Export audit as CSV |
| `/bridge/status` | GET | Cross-chain bridge status |

## Harness Output

```
═══════════════════════════════════════════════════════
  AEGIS MESH — 8-Agent Dual-Chain Harness
  Arbitrum Sepolia + XRPL EVM Sidechain
  Governed by Aegis 6-Layer Policy Engine
═══════════════════════════════════════════════════════

📋 Registering 8 agents and 16 services...
  ✅ 8 agents registered, 16 services live

🔄 Running 16 transaction scenarios...
  ✅ Atlas buys design from Pixel → $0.50 on arbitrum
  ✅ Pixel buys ML inference from Nova → $1.20 on arbitrum
  ...
  ✅ 🌉 Atlas (Arb) buys from XRPL market → $1.00 cross-chain
  🛡️ Policy test: over per-tx cap ($50 > $25) → DENIED layer 2
  🛡️ Policy test: unauthorized chain (solana) → DENIED layer 3

  Results: 14 approved, 2 policy-denied ✅

📝 NL Policy Editor: 4/4 parsed correctly
📊 Fleet: 8 agents, 14 txs, 100% verified
📜 Audit: 34 entries, 2 denials logged
🌉 Bridge: USDC ↔ RLUSD active (MoonPay CLI)
```

## Built On

- **[Aegis](https://github.com/ghost-clio/aegis-agent)** — Self-governing agent treasury (OWS vault + MoonPay CLI + 66 tests)
- **[Open Wallet Standard](https://openwallet.sh)** — Secure local wallet storage and agent access
- **[MoonPay CLI](https://dev.moonpay.com)** — 54 crypto tools across 17 skills
- **[x402](https://www.x402.org)** — HTTP-native micropayments
- **Arbitrum** — L2 scaling for Ethereum
- **XRPL EVM Sidechain** — Ripple's EVM-compatible network

## Project Structure

```
aegis-mesh/
├── src/
│   ├── gateway.js      # Dual-chain x402 gateway (16 features)
│   ├── governance.js   # 6-layer policy engine
│   ├── chains.js       # Arbitrum + XRPL EVM config
│   ├── audit.js        # Append-only audit log
│   └── harness.js      # 8-agent demo harness
├── test/
│   ├── governance.test.js  # 11 tests (all 6 layers + dynamic updates)
│   ├── chains.test.js      # 5 tests (dual-chain config)
│   ├── audit.test.js       # 7 tests (log integrity)
│   └── gateway.test.js     # Integration tests
├── aegis-core/             # Aegis agent (66 tests, imported as dependency)
├── docs/
│   └── index.html          # Live dashboard (GitHub Pages)
└── README.md
```

## Tracks

- **Track 02: Agent Spend Governance & Identity** — 6-layer policy engine, NL editor, fleet admin, audit logs
- **Track 04: Multi-Agent Systems & Autonomous Economies** — 8 agents, dual-chain mesh, cross-chain transactions
- **Track 03: Pay-Per-Call Services & API Monetization** — x402 micropayment gateway for any service

## License

MIT
