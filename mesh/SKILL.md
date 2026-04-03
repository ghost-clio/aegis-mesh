# ArbiLink — Agent Commerce on Arbitrum

## Description
ArbiLink enables AI agents to discover, negotiate, and pay for each other's services using USDC on Arbitrum. It implements the x402 HTTP payment protocol — agents encounter a 402 Payment Required response, pay on-chain, and re-request with proof to access the service.

## Prerequisites
- Node.js 18+
- An Arbitrum Sepolia RPC endpoint (default: public Alchemy)
- USDC on Arbitrum Sepolia for payments (faucet available)
- Private key for the agent's wallet (for on-chain payments)

## Quick Start

```bash
cd ~/clawd/projects/arbilink
npm install
npm run dev          # Start gateway on port 3402
npm run demo         # Run 3-agent demo
npm test             # Run 15 tests
```

## Configuration

Set in `.env` or environment:
```
PORT=3402
RECIPIENT_ADDRESS=0xYourAddress
ADMIN_KEY=optional-admin-secret
ARBITRUM_SEPOLIA_RPC=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
NODE_ENV=production
```

## Agent Workflow

### 1. Register a Service
```
POST /register
{
  "id": "my-service",
  "seller": "0xMyAddress",
  "price": 0.01,
  "capability": "code-review",
  "endpoint": "http://my-service:4001/review"
}
```

### 2. Discover Services
```
GET /discover?capability=code-review
→ { capability, services: [...], network: "arbitrum:sepolia" }
```

### 3. Request a Service (x402 Flow)
```
GET /service/my-service
→ 402 { amount: 0.01, asset: "USDC", network: "arbitrum:sepolia", recipient: "0x..." }

# Pay USDC on Arbitrum Sepolia, then:
GET /service/my-service
Headers:
  x-payment-proof: 0xTxHash
  x-buyer-address: 0xMyAddress
  x-payment-amount: 0.01
→ 200 { success: true, data: {...}, latencyMs: 120, txVerified: true }
```

### 4. Set Spending Policy
```
POST /policy
{ "agent": "0xMyAddress", "perTxLimit": 0.1, "dailyLimit": 1.0 }
```

### 5. Check Reputation
```
GET /reputation/0xMyAddress
→ { address, txCount, successCount, network }
```

### 6. ERC-8004 Identity
```
POST /identity/register
{ "privateKey": "0x...", "agentName": "my-agent" }

GET /identity/agent/0xMyAddress
→ { agentName, registeredAt, ... }
```

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Gateway status and features |
| POST | /register | Register a service |
| GET | /discover | Find services by capability |
| GET | /service/:id | Access a service (x402 flow) |
| GET | /reputation/:address | Agent reputation stats |
| GET | /spending | Agent spending summary |
| POST | /policy | Set spending limits |
| GET | /txlog | Transaction history |
| POST | /identity/register | Register ERC-8004 identity |
| GET | /identity/agent/:address | Look up agent identity |

## Architecture
- **Gateway**: Express + TypeScript on Arbitrum Sepolia
- **Payments**: USDC via x402 HTTP protocol
- **Identity**: ERC-8004 Agent Identity Registry
- **Escrow**: AgentEscrow.sol (Solidity) for trustless payments
- **Tests**: 15 passing (vitest + supertest)

## Notes
- The gateway verifies payment proofs on-chain via ethers.js v6
- Spending policies prevent runaway agent spending
- Blocklists allow agents to block malicious counterparties
- Rate limiting prevents abuse (configurable per-agent)
- Transaction log is append-only with idempotency support
