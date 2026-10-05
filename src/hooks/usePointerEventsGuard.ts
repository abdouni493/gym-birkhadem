import { useEffect } from 'react';

/**
 * Self-healing guard against Radix leaving `pointer-events: none` stuck on
 * <body>.
 *
 * Radix (Dialog / DropdownMenu / AlertDialog / Select) locks the page by
 * setting `document.body.style.pointerEvents = 'none'` while an overlay is
 * open, and clears it on close. If a render error is thrown mid-transition —
 * e.g. opening a dialog straight from a dropdown item — the overlay is torn
 * down without its cleanup running and the lock is never released, so the
 * whole UI stops responding to the mouse (the reported "mouse blocked" bug).
 *
 * This watches the body's inline style and, whenever the lock appears, checks
 * shortly after whether any Radix overlay is actually open. If none is, the
 * lock is a leak and gets cleared. A legitimately-open dialog always keeps a
 * `[data-state="open"]` node in the DOM, so this never fights a real overlay.
 */
export function usePointerEventsGuard(): void {
  useEffect(() => {
    const OPEN_OVERLAY = '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-state="open"][data-radix-menu-content]';

    const clearIfLeaked = () => {
      if (document.body.style.pointerEvents !== 'none') return;
      if (document.querySelector(OPEN_OVERLAY)) return; // a real overlay owns the lock
      document.body.style.pointerEvents = '';
    };

    const observer = new MutationObserver(() => {
      // Defer past Radix's own close animation before deciding it leaked.
      window.setTimeout(clearIfLeaked, 300);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });

    // Also re-check on navigation-ish interactions in case an observer tick was missed.
    const onPointerDown = () => window.setTimeout(clearIfLeaked, 350);
    window.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);
}
