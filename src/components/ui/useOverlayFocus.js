import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function useOverlayFocus({
  open,
  containerRef,
  onClose,
  closeDisabled = false,
}) {
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const panel = containerRef.current;
    const firstFocusable = panel?.querySelector("[autofocus]")
      || panel?.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable || panel)?.focus?.();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!closeDisabledRef.current) onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [containerRef, open]);
}
