'use client';

import { type ReactNode, useState } from 'react';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';

export default function AppLayout({ children }: { children: ReactNode }) {
  const [fabAction, setFabAction] = useState<() => void>(() => () => {
    // Placeholder — Wave 2 wires this to the New Session sheet
    console.log('FAB tapped');
  });

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={fabAction} />
      <TabBar />
    </div>
  );
}
