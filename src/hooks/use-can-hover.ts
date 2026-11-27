"use client";

import { useEffect, useState } from "react";

/** A mouse or trackpad is the primary pointer. False on phones and tablets, and until mounted. */
export const CAN_HOVER_QUERY = "(hover: hover) and (pointer: fine)";

export function useCanHover(query = CAN_HOVER_QUERY) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
