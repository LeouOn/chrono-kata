import type { Metadata, Viewport } from 'next';
import './globals.css';
import { QueryProvider } from '@/providers/QueryProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { THEME_INLINE_SCRIPT } from '@/components/system/ThemeScript';
import { ThemeApplier } from '@/components/system/ThemeApplier';

export const metadata: Metadata = {
  title: 'chrono-kata',
  description: 'A personal practice tracker. Time, reps, rating.',
  manifest: '/manifest.webmanifest',
  applicationName: 'chrono-kata',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'chrono-kata',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f0e0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INLINE_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>
          <ToastProvider>
            <ThemeApplier />
            {children}
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
