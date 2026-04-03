# ArbiLink 🔗

> Agent-to-agent commerce on Arbitrum — x402 payments, escrow, identity, spending governance.

https://github.com/user-attachments/assets/a4e79cfe-03bd-4eeb-b9ae-f7da2e1ed309



[![Tests](https://img.shields.io/badge/tests-15%20passing-brightgreen)](./src/__tests__)
[![Battle Test](https://img.shields.io/badge/battle%20test-20%20passing-brightgreen)](https://github.com/ghost-clio/arbilink-harness)
[![Arbitrum Sepolia](https://img.shields.io/badge/network-Arbitrum%20Sepolia-28A0F6)](https://sepolia.arbiscan.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What it does

ArbiLink lets AI agents discover, negotiate, and pay for each other's services using USDC on Arbitrum. An agent encounters a `402 Payment Required`, pays on-chain, and re-requests with proof — the **x402 HTTP payment protocol**.

**Live on Arbitrum Sepolia:**
- 🏦 AgentEscrow: [`0x26469E9C1a73eaC710bE3FC49966878a0e8ab0f7`](https://sepolia.arbiscan.io/address/0x26469E9C1a73eaC710bE3FC49966878a0e8ab0f7)
- 🪪 ERC-8004 Registration: [`TX 0x7f1d34f6...`](https://sepolia.arbiscan.io/tx/0x7f1d34f60bfb1bce0cff59ad6d03c37db66afd383c0c5a99af917fbca8cc8521)

## Features

| Feature | Description |
|---------|-------------|
| **x402 Payments** | HTTP 402 → USDC transfer → proof → access |
| **AgentEscrow** | Trustless escrow with timeout-based refunds (Solidity, audited) |
| **ERC-8004 Identity** | On-chain agent verification via AgentIdentity NFTs |
| **Service Discovery** | Register and find services by capability |
| **Spending Policies** | Per-tx and daily limits, enforced before payment |
| **Reputation** | Transaction count + success rate tracking |
| **Blocklists** | Agents can block malicious counterparties |
| **Rate Limiting** | Configurable per-agent request throttling |
| **Admin Fleet View** | Monitor all agent spending in one dashboard |
| **Idempotency** | Safe retries via idempotency keys (24h TTL) |
| **CSV Export** | Download transaction history as CSV |
| **Fiat Display** | ETH/USD price for gas cost transparency |

## Quick Start

```bash
git clone https://github.com/ghost-clio/arbilink.git
cd arbilink && npm install

# Configure
cp .env.example .env
# Set: DEPLOYER_KEY, RECIPIENT_ADDRESS, ADMIN_KEY

# Run
npm run dev          # Gateway on port 3403
npm test             # 15 unit/integration tests
```

## x402 Payment Flow

```
Agent A                    ArbiLink Gateway                  Arbitrum
   │                            │                               │
   │  GET /service/code-review  │                               │
   │ ─────────────────────────> │                               │
   │  402 {amount, asset, net}  │                               │
   │ <───────────────────────── │                               │
   │                            │                               │
   │  [pay USDC on-chain] ─────┼──────────────────────────────> │
   │                            │                               │
   │  GET /service/code-review  │                               │
   │  + x-payment-proof: 0x...  │  verifyTransaction(txHash)    │
   │  + x-buyer-address: 0x...  │ ─────────────────────────────>│
   │ ─────────────────────────> │                               │
   │                            │  ✅ verified                  │
   │  200 {data, latencyMs}     │ <─────────────────────────────│
   │ <───────────────────────── │                               │
```

## API

### Services
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register a service (id, seller, price, capability, endpoint) |
| GET | `/discover?capability=X` | Find services by capability |
| GET | `/service/:id` | Access service (402 without payment, 200 with proof) |

### Payments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/pay` | Submit direct USDC transfer (senderKey, destination, amount) |
| GET | `/balance/:address` | Get ETH + USDC balances |

### Identity (ERC-8004)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/identity/register` | Mint AgentIdentity NFT with metadata |
| GET | `/identity/registry` | Get registry contract info (name, symbol) |
| GET | `/identity/:tokenId` | Look up agent by NFT token ID |
| GET | `/identity/check/:address` | Check if address owns an AgentIdentity |

### Governance
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reputation/:address` | Agent reputation stats |
| GET | `/spending` | Agent spending summary (requires x-buyer-address header) |
| POST | `/policy` | Set spending limits (agent, perTxLimit, dailyLimit) |
| GET | `/txlog` | Transaction history (supports `?format=csv`) |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/spending` | Fleet-wide spending overview (requires x-admin-key) |
| POST | `/admin/default-policy` | Set default spending policy |
| POST | `/admin/rate-limit` | Configure per-agent rate limits |

## Smart Contracts

### AgentEscrow.sol

Trustless escrow for agent-to-agent payments. Buyer deposits USDC → seller claims after delivery → or buyer refunds after timeout.

**Security:**
- ✅ OpenZeppelin SafeERC20 (no silent transfer failures)
- ✅ ReentrancyGuard on all state-changing functions
- ✅ Checks-effects-interactions pattern
- ✅ Input validation (zero-address, self-trade, amount, serviceId length)
- ✅ ETH rejection (`receive()` reverts)

```solidity
function createEscrow(address seller, uint256 amount, string serviceId, uint256 timeoutSeconds)
function claimEscrow(uint256 escrowId)   // seller claims
function refundEscrow(uint256 escrowId)  // buyer refunds after timeout
function getEscrow(uint256 escrowId)     // view details
```

### ERC-8004 Identity

The [AgentIdentity registry](https://sepolia.arbiscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) is an EIP-1967 proxy NFT contract. Agents call `register(string metadata)` to mint an identity NFT with JSON metadata.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Gateway port | `3403` |
| `DEPLOYER_KEY` | Private key for deployments | — |
| `RECIPIENT_ADDRESS` | Default payment recipient | — |
| `ADMIN_KEY` | Admin API key | — |
| `ARBITRUM_SEPOLIA_RPC` | RPC endpoint | Public Arbitrum Sepolia |
| `USDC_ADDRESS` | USDC token on Arb Sepolia | `0x75faf114...` |
| `ESCROW_ADDRESS` | Deployed AgentEscrow | `0x26469E9C...` |

## Tech Stack

- **Runtime:** Node.js 18+ / TypeScript 5
- **Gateway:** Express.js
- **Blockchain:** ethers.js v6 + Arbitrum Sepolia
- **Contracts:** Solidity 0.8.20 + OpenZeppelin
- **Identity:** ERC-8004 AgentIdentity NFT
- **Testing:** Vitest + Supertest (15 unit tests + 20 battle tests)

## Testing

```bash
# Unit tests (gateway endpoints, in-memory)
npm test                    # 15 passing

# Battle tests (live Arbitrum Sepolia — requires running gateway)
# See: github.com/ghost-clio/arbilink-harness
cd ../arbilink-harness
GATEWAY_URL=http://localhost:3403 npm run battle   # 20 passing
```

Battle test verifies: contract deployment, ERC-8004 registration, full x402 flow, spending policies, reputation, stress (20 registrations in 18ms).

## Project Structure

```
arbilink/
├── contracts/
│   └── AgentEscrow.sol      # Escrow contract (SafeERC20, ReentrancyGuard)
├── build/                    # Compiled ABI + bytecode
├── src/
│   ├── index.ts              # Express gateway (12 features)
│   ├── arbitrum.ts           # ethers.js v6 — balances, payments, verification
│   ├── identity.ts           # ERC-8004 integration
│   ├── registry.ts           # In-memory service registry + reputation + policies
│   └── types.ts              # TypeScript interfaces
├── scripts/
│   ├── deploy-ethers.ts      # Deploy AgentEscrow via ethers
│   └── register-agent.mjs    # Register on ERC-8004
├── SKILL.md                  # OpenClaw agent skill
└── README.md
```

## Related

- **[arbilink-harness](https://github.com/ghost-clio/arbilink-harness)** — Test harness, 3-agent demo, and 20-test battle suite for live Sepolia verification
- **[Live Dashboard](https://ghost-clio.github.io/arbilink/)** — GitHub Pages dashboard with deployment info, features, and battle test results

## License

[MIT](LICENSE)

---

*Built for the [ArbiLink Challenge](https://arbitrumfoundation.notion.site) hackathon. Enabling autonomous agent commerce on Arbitrum.* 🔗
