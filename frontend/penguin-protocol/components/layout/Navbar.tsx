"use client";
import { usePrivy } from "@privy-io/react-auth";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';

export default function Navbar() {
  const { login, authenticated, user, logout } = usePrivy();
  const pathname = usePathname();

  const shortAddress = user?.wallet?.address 
    ? `${user.wallet.address.slice(0, 4)}...${user.wallet.address.slice(-4)}`
    : "Connect";

  const navLinks = [
    { name: 'Launch', href: ROUTES.LAUNCH },
    { name: 'Vault', href: ROUTES.VAULT },
    { name: 'Markets', href: ROUTES.MARKETS },
  ];

  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[1200px] px-6">
      <div className="nav-pill flex items-center justify-between px-6 py-3">
        
        <div className="flex items-center gap-10">
          <Link href={ROUTES.HOME} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-black rounded-full" />
            </div>
            <span className="font-medium text-white tracking-tight hidden sm:block">Penguin</span>
          </Link>

          <div className="hidden md:flex gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.name}
                href={link.href}
                className={`text-[11px] uppercase tracking-[0.2em] font-mono transition-colors ${
                  pathname === link.href ? 'text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!authenticated ? (
            <button onClick={login} className="bg-white text-black px-6 py-2 rounded-full text-sm font-semibold hover:bg-blue-50 transition-all">
              Connect
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-mono text-blue-400">
                {shortAddress}
              </div>
              <button onClick={logout} className="text-[10px] font-mono text-neutral-600 hover:text-red-400 uppercase transition-colors">
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}