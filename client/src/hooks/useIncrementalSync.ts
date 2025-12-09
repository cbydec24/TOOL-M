// client/src/hooks/useIncrementalSync.ts
import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { fetchDeviceChanges } from "@/features/devices/devicesSlice";

/**
 * Hook to handle incremental data synchronization
 * 
 * Usage:
 * - First app load: Fetch complete data
 * - Subsequent: Poll for changes only every N seconds
 * - Reduces bandwidth and server load significantly
 */
export const useIncrementalSync = (pollIntervalMs: number = 30000) => {
  const dispatch = useDispatch<AppDispatch>();
  const { lastSyncTimestamp } = useSelector((state: RootState) => state.devices);
  const pollIntervalRef = useRef<NodeJS.Timeout>();
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // Only start polling after initial sync timestamp is set
    if (!lastSyncTimestamp || !isInitializedRef.current) {
      return;
    }

    // Poll for changes at specified interval
    pollIntervalRef.current = setInterval(() => {
      dispatch(fetchDeviceChanges(lastSyncTimestamp));
    }, pollIntervalMs);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [dispatch, lastSyncTimestamp, pollIntervalMs]);

  // Mark as initialized
  useEffect(() => {
    isInitializedRef.current = true;
  }, []);

  return {
    lastSyncTimestamp,
    isPolling: !!pollIntervalRef.current,
  };
};

export default useIncrementalSync;
