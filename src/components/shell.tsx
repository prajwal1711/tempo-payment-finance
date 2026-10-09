"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConnect, useDisconnect } from "wagmi";
import {
  Menu,
  ChevronDown,
  ArrowUpRight,
  Wallet,
  Landmark,
  Building2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { usePool, useBorrower } from "@/lib/hooks";
import { useWorkspace, type Workspace } from "./workspace-context";
import { short } from "@/lib/format";
import { workspaceEligibility } from "@/lib/workspace";
import deployment from "@/lib/deployment.json";
const navigation = {
  investor: [
    ["/portfolio", "My portfolio"],
    ["/", "tPF pool"],
    ["/portfolio/withdrawals", "Withdrawals"],
    ["/portfolio/activity", "My transactions"],
  ],
  borrower: [
    ["/borrower", "Credit line"],
    ["/borrower/loans", "Loans"],
    ["/borrower/settlements", "Settlement batches"],
    ["/", "tPF pool"],
  ],
  manager: [
    ["/manager", "Pool dashboard"],
    ["/manager/borrowers", "Borrowers"],
    ["/manager/loans", "Loan book"],
    ["/manager/redemptions", "Redemption queue"],
    ["/manager/settings", "Settings"],
    ["/", "tPF pool"],
  ],
};
const homes = {
  investor: "/portfolio",
  borrower: "/borrower",
  manager: "/manager",
};
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  const router = useRouter();
  const { account, demo, setDemo, investor, setInvestor } = useWorkspace();
  const connect = useConnect(),
    disconnect = useDisconnect();
  const pool = usePool(),
    borrower = useBorrower(account.address);
  const [chosen, setChosen] = useState<Workspace>("investor");
  const [mobile, setMobile] = useState(false);
  const previous = useRef(account.address);
  const workspace: Workspace = path.startsWith("/manager")
    ? "manager"
    : path.startsWith("/borrower")
      ? "borrower"
      : path.startsWith("/portfolio")
        ? "investor"
        : chosen;
  const permissions = workspaceEligibility(
    account.address,
    borrower.data?.borrower,
    pool.data?.owner,
    pool.data?.pendingOwner,
  );
  const manager = permissions.manager;
  const configured = permissions.borrower;
  const eligible =
    workspace === "investor" ||
    (workspace === "manager" ? manager : configured);
  useEffect(() => {
    if (previous.current === account.address) return;
    const old = previous.current;
    previous.current = account.address;
    setDemo(false);
    setChosen("investor");
    if (!account.address && old) router.replace("/");
    else if (account.address && (path === "/" || old))
      router.replace("/portfolio");
  }, [account.address, path, router, setDemo]);
  const demoLabel =
    workspace === "investor"
      ? `Demo Investor ${investor}`
      : workspace === "borrower"
        ? "Demo Borrower"
        : "Pool Manager";
  const demoAddress =
    workspace === "investor"
      ? investor === "A"
        ? deployment.investorAAddress
        : deployment.investorBAddress
      : workspace === "borrower"
        ? deployment.demoBorrowerAddress
        : pool.data?.owner || deployment.managerAddress;
  const title =
    Object.values(navigation)
      .flat()
      .find(([href]) => href === path)?.[1] || "Payment Finance";
  function choose(value: Workspace) {
    setChosen(value);
    setMobile(false);
    router.push(homes[value]);
  }
  const sidebar = (
    <>
      <Link href="/" className="brand">
        <span className="brand-mark">pf</span>
        <span>Payment Finance</span>
      </Link>
      <div className="workspace-picker">
        <Select
          value={workspace}
          onValueChange={(value) => choose(value as Workspace)}
        >
          <SelectTrigger aria-label="Select workspace">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="investor">
              <Wallet size={15} />
              Investor
            </SelectItem>
            {(configured || demo) && (
              <SelectItem value="borrower">
                <Building2 size={15} />
                Borrower
              </SelectItem>
            )}
            {(manager || demo) && (
              <SelectItem value="manager">
                <Settings2 size={15} />
                Manager
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <nav aria-label={`${workspace} navigation`}>
        {navigation[workspace].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobile(false)}
            aria-current={path === href ? "page" : undefined}
            className={`nav-item ${path === href ? "active" : ""}`}
          >
            {label}
            {path === href && <span aria-hidden>→</span>}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Badge variant="secondary">Tempo testnet</Badge>
        <p>AlphaUSD · Test tokens</p>
        <a
          href={`${deployment.explorerUrl}/address/${deployment.vaultAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          View contract <ArrowUpRight size={14} />
        </a>
        {!demo && (
          <Button
            variant="ghost"
            className="demo-link"
            onClick={() => {
              setDemo(true);
              choose("investor");
            }}
          >
            Explore demo
          </Button>
        )}
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <Sheet open={mobile} onOpenChange={setMobile}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="mobile-sidebar"
                aria-describedby={undefined}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Workspace navigation</SheetTitle>
                </SheetHeader>
                {sidebar}
              </SheetContent>
            </Sheet>
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <Badge variant="secondary" className="header-network">
              Tempo testnet
            </Badge>
            {account.address ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {short(account.address)}
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => disconnect.mutate()}>
                    Disconnect wallet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                disabled={connect.isPending || !connect.connectors[0]}
                onClick={() =>
                  connect.mutate({ connector: connect.connectors[0] })
                }
              >
                {connect.isPending ? "Connecting…" : "Connect wallet"}
              </Button>
            )}
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <div>
              <b>Viewing {demoLabel} · read-only</b>
              <span className="address">
                {short(demoAddress)} · Real on-chain testnet data
              </span>
            </div>
            {workspace === "investor" && (
              <Select
                value={investor}
                onValueChange={(value) => setInvestor(value as "A" | "B")}
              >
                <SelectTrigger aria-label="Demo investor" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Investor A</SelectItem>
                  <SelectItem value="B">Investor B</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setDemo(false);
                router.push(account.address ? "/portfolio" : "/");
              }}
            >
              Exit demo
            </Button>
          </div>
        )}
        {connect.error && (
          <div className="error-banner" role="alert">
            {connect.error.message.split("\n")[0]}
          </div>
        )}
        {account.isConnected && account.chainId !== 42431 && (
          <div className="error-banner" role="alert">
            Switch to Tempo Moderato (42431) before signing.
          </div>
        )}
        <main>
          {!demo && !eligible ? (
            <section className="access-state">
              <Landmark size={32} />
              <h1>
                {account.address
                  ? "Workspace unavailable"
                  : "Connect your wallet"}
              </h1>
              <p>
                {account.address
                  ? "This wallet does not have the permissions for this workspace. Your portfolio and the public pool remain available."
                  : "Connect to view your balances and available workspaces, or explore the read-only demo."}
              </p>
              <Button variant="outline" onClick={() => router.push("/")}>
                View tPF pool
              </Button>
            </section>
          ) : (
            children
          )}
        </main>
        <footer>
          <span>Tempo Moderato · Testnet demonstration</span>
          <a
            href={`${deployment.explorerUrl}/address/${deployment.vaultAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            tPF contract ↗
          </a>
        </footer>
      </div>
    </div>
  );
}
