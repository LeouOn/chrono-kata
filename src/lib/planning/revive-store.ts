/**
 * Where the revive state lives: this device's localStorage, under one key.
 *
 * It is a UI nicety (which gentle offer was put aside today), not user data: it is
 * not in the backup, not in the database, and losing it only means an offer may
 * show once more. So every call is wrapped and none can throw - a private window,
 * a full disk or a corrupt value must never reach the Home screen.
 */

import { EMPTY_REVIVE_STATE, parseReviveState, type ReviveState } from './revive';

export const REVIVE_STORAGE_KEY = 'chrono-kata-revive';

export function readReviveState(): ReviveState {
  try {
    if (typeof localStorage === 'undefined') return EMPTY_REVIVE_STATE;
    const raw = localStorage.getItem(REVIVE_STORAGE_KEY);
    return raw === null ? EMPTY_REVIVE_STATE : parseReviveState(JSON.parse(raw));
  } catch {
    return EMPTY_REVIVE_STATE;
  }
}

/** True when it was kept; false when the browser refused (the offer simply may return). */
export function writeReviveState(state: ReviveState): boolean {
  try {
    localStorage.setItem(REVIVE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
