import { existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
if (existsSync(".env.local"))
  throw new Error(
    ".env.local already exists; refusing to overwrite credentials",
  );
const roles = ["MANAGER", "INVESTOR_A", "INVESTOR_B", "BORROWER", "SETTLEMENT"];
const lines = ["TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz"];
const addresses = {};
for (const role of roles) {
  const key = generatePrivateKey();
  lines.push(`${role}_PRIVATE_KEY=${key}`);
  addresses[role] = privateKeyToAccount(key).address;
}
writeFileSync(".env.local", `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(
  "Created testnet-only credentials in ignored .env.local. Public addresses:",
  addresses,
);
