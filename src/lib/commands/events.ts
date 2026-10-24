/**
 * The two imperative palette actions are requests to controls that already
 * exist elsewhere in the tree (the capture sheet and the new-session form).
 * A window event keeps the registry free of React state and means the palette
 * never becomes the only way to do either.
 */
export const CAPTURE_EVENT = 'chrono-kata:capture';
export const SESSION_EVENT = 'chrono-kata:session';

export function requestCapture(): void {
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT));
}

export function requestSession(): void {
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}
