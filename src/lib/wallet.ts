import { createConfig, http } from "wagmi";
import { tempoWallet } from "wagmi/connectors";
import { tempoModerato } from "viem/chains";
import deployment from "./deployment.json";
import type { Address } from "viem";

export const chain = tempoModerato.extend({
  feeToken: deployment.feeTokenAddress as Address,
});
export const walletConfig = createConfig({
  chains: [chain],
  connectors: [tempoWallet()],
  multiInjectedProviderDiscovery: false,
  transports: { [chain.id]: http(deployment.rpcUrl) },
  ssr: true,
});
