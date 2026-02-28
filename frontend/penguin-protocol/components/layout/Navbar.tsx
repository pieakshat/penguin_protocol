"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';

const DEMO_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

export default function Navbar() {
  const pathname = usePathname();

  const shortAddress = `${DEMO_ADDRESS.slice(0, 6)}...${DEMO_ADDRESS.slice(-4)}`

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
          <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-mono text-blue-400">
            {shortAddress}
          </div>
        </div>
      </div>
    </nav>
  );
}