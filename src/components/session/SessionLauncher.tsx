'use client';

import React, { createContext, useContext } from 'react';

export interface SessionLink {
  taskId?: string | null;
  projectId?: string | null;
  label?: string;
  estimateMin?: number | null;
}

export interface SessionLauncher {
  /** Open the session form, optionally linked to a task or project. */
  openForLink: (link: SessionLink) => void;
}

const NOOP: SessionLauncher = { openForLink: () => {} };

const SessionLauncherContext = createContext<SessionLauncher>(NOOP);

export function SessionLauncherProvider({
  value,
  children,
}: {
  value: SessionLauncher;
  children: React.ReactNode;
}) {
  return <SessionLauncherContext.Provider value={value}>{children}</SessionLauncherContext.Provider>;
}

/**
 * Access the app-level session launcher. Components rendered outside the
 * provider (unit tests, isolated stories) get a no-op so they never crash.
 */
export function useSessionLauncher(): SessionLauncher {
  return useContext(SessionLauncherContext);
}
