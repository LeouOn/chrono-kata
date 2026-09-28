'use client';

import React, { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

function atAppHome(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/index.html';
}

export function PlatformRuntime() {
  useEffect(() => {
    const native = Capacitor.isNativePlatform();

    if (native && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });
    } else {
      void window.serwist?.register();
      void navigator.storage?.persist?.();
    }

    if (!native) return;

    let cancelled = false;
    let handle: { remove: () => Promise<void> } | undefined;
    const listener = App.addListener('backButton', ({ canGoBack }) => {
      if (!atAppHome() && canGoBack) {
        window.history.back();
        return;
      }
      if (!atAppHome()) {
        window.location.assign('/');
        return;
      }
      void App.exitApp();
    });
    void listener.then((next) => {
      if (cancelled) {
        void next.remove();
        return;
      }
      handle = next;
    });

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);

  return null;
}
