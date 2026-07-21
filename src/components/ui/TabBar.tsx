'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListTodo, Sparkles, Cpu, Settings as SettingsIcon } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/sessions', label: 'Sessions', icon: ListTodo },
  { href: '/reflect', label: 'Reflect', icon: Sparkles },
  { href: '/llm', label: 'LLM', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-base/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 max-w-md mx-auto">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center py-2 gap-1 text-xs transition-colors ${
                active ? 'text-accent' : 'text-text-muted'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
