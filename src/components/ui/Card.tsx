import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: Props) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}
