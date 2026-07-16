"use client";

import { useEffect, useState } from "react";

// Returns `value` delayed by `delay` ms — so a search box can update instantly (responsive
// input) while the debounced result drives the server fetch, collapsing a burst of keystrokes
// into a single request. Pair with a request-sequence guard to drop out-of-order responses.
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
