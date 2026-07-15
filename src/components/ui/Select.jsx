import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import styles from "./Ui.module.css";

function sameValue(left, right) {
  return String(left) === String(right);
}

function nextEnabledIndex(options, startIndex, direction) {
  if (!options.length) return -1;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }

  return -1;
}

export default function Select({
  value,
  options = [],
  onChange,
  className = "",
  wrapperClassName = "",
  disabled = false,
  "aria-label": ariaLabel,
}) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxId = useId();
  const selectedIndex = options.findIndex((option) => sameValue(option.value, value));
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options.find((option) => !option.disabled);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) setHighlightedIndex(selectedIndex);
  }, [open, selectedIndex]);

  const openMenu = (direction = 1) => {
    const fallbackStart = direction > 0 ? -1 : 0;
    const initialIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : nextEnabledIndex(options, fallbackStart, direction);
    setHighlightedIndex(initialIndex);
    setOpen(true);
  };

  const chooseIndex = (index) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu(event.key === "ArrowUp" ? -1 : 1);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => nextEnabledIndex(options, current, direction));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const direction = event.key === "Home" ? 1 : -1;
      setHighlightedIndex(nextEnabledIndex(options, direction > 0 ? -1 : 0, direction));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseIndex(highlightedIndex);
    }
  };

  const rootClasses = [styles.selectRoot, wrapperClassName].filter(Boolean).join(" ");
  const triggerClasses = [styles.selectTrigger, className].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className={rootClasses} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={triggerClasses}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>{selectedOption?.label ?? ""}</span>
        <ChevronDown className={styles.selectChevron} aria-hidden="true" />
      </button>

      {open ? (
        <div id={listboxId} className={styles.selectMenu} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const selected = sameValue(option.value, value);
            const highlighted = index === highlightedIndex;
            return (
              <button
                key={String(option.value)}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                className={`${styles.selectOption}${selected ? ` ${styles.selectOptionSelected}` : ""}${highlighted ? ` ${styles.selectOptionHighlighted}` : ""}`}
                aria-selected={selected}
                disabled={option.disabled}
                onPointerEnter={() => setHighlightedIndex(index)}
                onClick={() => chooseIndex(index)}
              >
                <span>{option.label}</span>
                {selected ? <Check aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
