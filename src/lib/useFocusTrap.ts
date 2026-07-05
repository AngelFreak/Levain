import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessible dialog focus management for a container ref.
 *
 * While `active`, this:
 *  - moves focus into the dialog on open (first focusable, or the container),
 *  - traps Tab / Shift+Tab within the dialog (wraps at the ends),
 *  - restores focus to the previously-focused element on close/unmount.
 *
 * Escape-to-close is handled by the dialog components themselves, so it's not
 * duplicated here. Pointer interaction outside the dialog is already blocked by
 * the overlay, so this focuses purely on keyboard containment.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog. Defer a tick so open animations/mounting settle.
    const focusFirst = () => {
      const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        // No focusable child — make the container itself focusable and focus it
        // so screen-reader focus lands inside the dialog, not on the page behind.
        node.setAttribute('tabindex', '-1');
        node.focus();
      }
    };
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null // visible only
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === first || !node.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !node.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    node.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener('keydown', handleKeyDown);
      // Restore focus to where it was before the dialog opened.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [ref, active]);
}
