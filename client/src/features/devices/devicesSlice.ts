// client/src/features/devices/devicesSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { Device, NetworkInterface } from "@/lib/types";
import { getDevices, getDeviceInterfaces, getDeviceChanges } from "@/lib/api";

interface DevicesState {
  items: Device[];
  selectedDevice: Device | null;
  selectedDeviceInterfaces: NetworkInterface[];
  loading: boolean;
  lastSyncTimestamp: string | null;  // Track last sync time for incremental updates

  // Filters used by your UI
  search: string;
  filter: "all" | "online" | "offline" | "warning" | "mac-change";
  deviceType: string; // 'all' or specific device type

  error: string | null;
}

const initialState: DevicesState = {
  items: [],
  selectedDevice: null,
  selectedDeviceInterfaces: [],
  loading: false,
  lastSyncTimestamp: null,

  // Default filter values
  search: "",
  filter: "all",
  deviceType: "all",

  error: null,
};

// Pre-compiled normalize function for better performance
const normalizeDeviceType = (raw?: string | null): string => {
  if (!raw) return "Other";
  const s = raw.trim().toLowerCase();
  if (s === "router") return "Router";
  if (s === "switch" || s === "switches") return "Switch";
  if (s === "firewall") return "Firewall";
  if (s.includes("voice") && (s.includes("gateway") || s.includes("gw"))) return "Voice-Gateway";
  if (s === "ap" || s.includes("access") && s.includes("point")) return "Other";
  return "Other";
};

// Fetch all devices (full initial load)
export const fetchDevices = createAsyncThunk<Device[]>(
  "devices/fetchDevices",
  async () => {
    // Fetch devices and normalize deviceType to a canonical set used by the UI
    const devices = (await getDevices()) as Device[];

    return devices.map((d) => ({
      ...d,
      deviceType: normalizeDeviceType(d.deviceType),
    } as Device));
  }
);

// Fetch only changed devices since last sync (incremental update)
export const fetchDeviceChanges = createAsyncThunk<
  { devices: Device[]; timestamp: string },
  string  // Pass last sync timestamp
>("devices/fetchDeviceChanges", async (lastTimestamp) => {
  const result = await getDeviceChanges(lastTimestamp);
  const devices = (result.changed) as Device[];
  
  return {
    devices: devices.map((d) => ({
      ...d,
      deviceType: normalizeDeviceType(d.deviceType),
    } as Device)),
    timestamp: result.timestamp,
  };
});

// Fetch interfaces of a single device
export const fetchDeviceInterfaces = createAsyncThunk<
  NetworkInterface[],
  number
>("devices/fetchDeviceInterfaces", async (deviceId) => {
  const interfaces = await getDeviceInterfaces(deviceId);
  return interfaces;
});

export const devicesSlice = createSlice({
  name: "devices",
  initialState,
  reducers: {
    setDevices: (state, action: PayloadAction<Device[]>) => {
      state.items = action.payload;
    },

    addDevice: (state, action: PayloadAction<Device>) => {
      state.items.push(action.payload);
    },

    // Merge changed devices into existing list (incremental update)
    mergeDeviceChanges: (state, action: PayloadAction<Device[]>) => {
      const changedDevices = action.payload;
      changedDevices.forEach((changed) => {
        const existingIdx = state.items.findIndex((d) => d.id === changed.id);
        if (existingIdx !== -1) {
          // Update existing device
          state.items[existingIdx] = { ...state.items[existingIdx], ...changed };
        } else {
          // Add new device
          state.items.push(changed);
        }
      });
    },

    updateDeviceStatus: (
      state,
      action: PayloadAction<{ id: number; status: "online" | "offline" | "warning" }>
    ) => {
      const device = state.items.find((d: Device) => d.id === action.payload.id);
      if (device) {
        device.status = action.payload.status;
      }
    },

    selectDevice: (state, action: PayloadAction<number>) => {
      state.selectedDevice = state.items.find(
        (d: Device) => d.id === action.payload
      ) || null;
    },

    setSelectedDeviceInterfaces: (
      state,
      action: PayloadAction<NetworkInterface[]>
    ) => {
      state.selectedDeviceInterfaces = action.payload;
    },

    deleteDevice: (state, action: PayloadAction<number>) => {
      state.items = state.items.filter((d: Device) => d.id !== action.payload);

      if (state.selectedDevice?.id === action.payload) {
        state.selectedDevice = null;
        state.selectedDeviceInterfaces = [];
      }
    },

    // Update last sync timestamp
    setSyncTimestamp: (state, action: PayloadAction<string>) => {
      state.lastSyncTimestamp = action.payload;
    },

    /* -----------------------------
       FILTER ACTIONS FOR DEVICES PAGE
    ------------------------------*/
    setSearch: (state, action: PayloadAction<string>) => {
      state.search = action.payload;
    },

    setFilter: (
      state,
      action: PayloadAction<"all" | "online" | "offline" | "warning" | "mac-change">
    ) => {
      state.filter = action.payload;
    },
    setDeviceType: (state, action: PayloadAction<string>) => {
      state.deviceType = action.payload;
    },
  },

  extraReducers: (builder) => {
    builder
      // Full device fetch (on app start)
      .addCase(fetchDevices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDevices.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        // Store the timestamp for next incremental sync (use current time)
        state.lastSyncTimestamp = new Date().toISOString();
      })
      .addCase(fetchDevices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch devices";
      })
      // Incremental device changes fetch
      .addCase(fetchDeviceChanges.pending, (state) => {
        // Don't show loading indicator for background syncs
        state.error = null;
      })
      .addCase(fetchDeviceChanges.fulfilled, (state, action) => {
        // Merge changed devices into existing list
        const changedDevices = action.payload.devices;
        changedDevices.forEach((changed) => {
          const existingIdx = state.items.findIndex((d) => d.id === changed.id);
          if (existingIdx !== -1) {
            state.items[existingIdx] = { ...state.items[existingIdx], ...changed };
          } else {
            state.items.push(changed);
          }
        });
        // Update sync timestamp for next poll
        state.lastSyncTimestamp = action.payload.timestamp;
      })
      .addCase(fetchDeviceChanges.rejected, (state, action) => {
        // Log error but don't show to user for background syncs
        console.error("Background sync failed:", action.error.message);
      })
      .addCase(fetchDeviceInterfaces.fulfilled, (state, action) => {
        state.selectedDeviceInterfaces = action.payload;
      });
  },
});

export const {
  setDevices,
  addDevice,
  mergeDeviceChanges,
  updateDeviceStatus,
  selectDevice,
  setSelectedDeviceInterfaces,
  deleteDevice,
  setSyncTimestamp,

  // Filters
  setSearch,
  setFilter,
  setDeviceType,
} = devicesSlice.actions;

export default devicesSlice.reducer;
