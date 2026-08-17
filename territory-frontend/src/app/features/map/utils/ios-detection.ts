/**
 * Detects iOS Safari/WebKit browsers.
 *
 * html-to-image uses SVG foreignObject which cannot capture Canvas elements
 * on iOS. This gates the manual composition fallback.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in globalThis);
}
