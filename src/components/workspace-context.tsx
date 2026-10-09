"use client";
import { createContext, useContext, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import deployment from "@/lib/deployment.json";

export type Workspace = "investor" | "borrower" | "manager";
const Context = createContext<{
  demo: boolean;
  setDemo: (value: boolean) => void;
  investor: "A" | "B";
  setInvestor: (value: "A" | "B") => void;
}>({ demo: false, setDemo: () => {}, investor: "A", setInvestor: () => {} });
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [demo, setDemo] = useState(false);
  const [investor, setInvestor] = useState<"A" | "B">("A");
  return (
    <Context.Provider value={{ demo, setDemo, investor, setInvestor }}>
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  const account = useAccount();
  return {
    ...context,
    account,
    investorAddress: context.demo
      ? ((context.investor === "A"
          ? deployment.investorAAddress
          : deployment.investorBAddress) as Address)
      : account.address,
    borrowerAddress: context.demo
      ? (deployment.demoBorrowerAddress as Address)
      : account.address,
  };
}
