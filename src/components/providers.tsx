"use client";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnapshotPoller } from "@/lib/hooks";
import { TooltipProvider } from "./ui/tooltip";
import { WorkspaceProvider } from "./workspace-context";
import { walletConfig } from "@/lib/wallet";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 2, staleTime: 4_000 } },
      }),
  );
  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WorkspaceProvider>
            <SnapshotPoller />
            {children}
          </WorkspaceProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
