'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import deployment from '@/lib/deployment.json';

const navigation = [
  ['/', 'Overview', '◈'], ['/invest', 'Invest', '↗'], ['/borrow', 'Borrow', '⇄'],
  ['/settlement', 'Settlement', '◎'], ['/manage', 'Manage', '⚙'],
];
function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const account = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">t<span>↗</span></span><div>Tempo<span>PAYMENT FINANCE</span></div></Link>
      <div className="workspace-label">THE SETTLEMENT GAP, FINANCED.</div>
      <nav aria-label="Main navigation">{navigation.map(([href, label, icon]) => <Link key={href} href={href} className={path === href ? 'nav-item active' : 'nav-item'}><span aria-hidden>{icon}</span>{label}{path === href && <i />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="network"><i />Tempo Moderato</div><p>Testnet demonstration<br />AlphaUSD · no real funds</p><a className="subtle-link" href={`${deployment.explorerUrl}/address/${deployment.vaultAddress}`} target="_blank" rel="noreferrer">View contract ↗</a><span className="version">V0.1 / HACKATHON EDITION</span></div>
    </aside>
    <div className="main-column"><header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> {navigation.find(([href]) => href === path)?.[1] || 'Overview'}</div><div className="topbar-actions"><span className="badge muted">TESTNET</span>{account.address ? <button className="wallet-button" onClick={() => disconnect.mutate()} title="Disconnect wallet"><span className="wallet-dot" />{short(account.address)}</button> : <button className="wallet-button" disabled={connect.isPending} onClick={() => connect.mutate({ connector: connect.connectors[0] })}>{connect.isPending ? 'Connecting…' : 'Connect Tempo Wallet'}<span>↗</span></button>}</div></header>
      {connect.error && <div className="error-banner" role="alert">{connect.error.message.split('\n')[0]}</div>}
      {account.isConnected && account.chainId !== 42431 && <div className="error-banner">Switch your wallet to Tempo Moderato (42431) before signing.</div>}
      <main>{children}</main><footer><span>Payment capital, measured in hours.</span><span>18% APR · 4.93 bps/day <i>·</i> AlphaUSD</span></footer>
    </div>
  </div>;
}
