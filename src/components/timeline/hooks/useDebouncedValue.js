import { useEffect, useState } from "react";

export function useDebouncedValue(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (Object.is(value, debouncedValue)) return undefined;

    const timeoutId = globalThis.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => globalThis.clearTimeout(timeoutId);
  }, [debouncedValue, delay, value]);

  return debouncedValue;
}
