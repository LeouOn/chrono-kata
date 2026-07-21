'use client';

import { type ReactNode } from 'react';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={() => console.log('FAB tapped')} />
      <TabBar />
    </div>
  );
}
