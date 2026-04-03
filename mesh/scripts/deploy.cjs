const hre = require("hardhat");

async function main() {
  // Arbitrum Sepolia USDC address
  const USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

  console.log("Deploying AgentEscrow to Arbitrum Sepolia...");
  console.log("USDC address:", USDC_ADDRESS);

  const AgentEscrow = await hre.ethers.getContractFactory("AgentEscrow");
  const escrow = await AgentEscrow.deploy(USDC_ADDRESS);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("✅ AgentEscrow deployed to:", address);
  console.log("\nAdd to .env:");
  console.log(`ESCROW_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
