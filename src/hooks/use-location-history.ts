"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  forgetLocation,
  loadLocationHistory,
  rememberLocations,
} from "@/lib/deluge/location-history-store";
import { rankLocations, type LocationEntry } from "@/lib/location-history";

/**
 * Download folders used before on the connected daemon.
 * Re-read whenever `active` turns true (a dialog opening), so a folder
 * recorded by another dialog shows up.
 */
export function useLocationHistory(active = true) {
  const [entries, setEntries] = useState<LocationEntry[]>([]);

  useEffect(() => {
    if (active) setEntries(loadLocationHistory());
  }, [active]);

  /** Record the folders of an add or move that succeeded. */
  const remember = useCallback((paths: readonly string[]) => {
    setEntries(rememberLocations(paths));
  }, []);

  const forget = useCallback((path: string) => {
    setEntries(forgetLocation(path));
  }, []);

  const locations = useMemo(() => rankLocations(entries).map((entry) => entry.path), [entries]);

  return { locations, remember, forget };
}
