'use client';

import { type ReactNode, useState } from 'react';
import { TabBar } from '@/components/ui/TabBar';
import { FAB } from '@/components/ui/FAB';
import { SessionForm } from '@/components/session/SessionForm';
import { MilestoneCelebration } from '@/components/streak/MilestoneCelebration';
import { useSessions } from '@/hooks/useSessions';

export default function MainLayout({ children }: { children: ReactNode }) {
  const [fabOpen, setFabOpen] = useState(false);
  const { createSession } = useSessions();

  return (
    <div className="min-h-dvh pb-20">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
      <FAB onClick={() => setFabOpen(true)} />
      <TabBar />
      <SessionForm
        open={fabOpen}
        onSave={async (input) => {
          await createSession(input);
          setFabOpen(false);
        }}
        onCancel={() => setFabOpen(false)}
      />
      <MilestoneCelebration />
    </div>
  );
}
