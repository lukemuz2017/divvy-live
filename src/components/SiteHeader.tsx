'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountMenu } from './AccountMenu';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/saved-routes', label: 'Saved routes' },
  { href: '/profile', label: 'Profile' },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between gap-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Divvy Live
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={pathname === link.href ? 'text-bike' : 'text-muted hover:text-ink'}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <AccountMenu />
    </header>
  );
}
