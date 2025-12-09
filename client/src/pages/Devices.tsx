// client/src/pages/Devices.tsx
import { useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { fetchDevices, setFilter, setSearch } from "@/features/devices/devicesSlice";
import { DeviceGrid } from "@/components/devices/DeviceGrid";
import { AddDeviceDialog } from "@/components/devices/AddDeviceDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { createDevice } from "@/lib/api";
import { Device } from "@/lib/types";
import { useLocation } from "wouter";

function useSearchParams() {
  const [location] = useLocation();
  const qs = typeof window !== "undefined" ? window.location.search : location.split("?")[1] ?? "";
  return new URLSearchParams(qs);
}

function getStatusColor(status: string) {
  switch (status) {
    case "online":
    case "up":
      return "text-green-600 bg-green-100";
    case "offline":
    case "down":
      return "text-red-600 bg-red-100";
    case "warning":
      return "text-orange-600 bg-orange-100";
    default:
      return "text-gray-600 bg-gray-100";
  }
}

export default function Devices() {
  const dispatch = useDispatch<AppDispatch>();
  const { items, filter, search, loading } = useSelector((state: RootState) => state.devices);
  const macLogs = useSelector((state: RootState) => state.macChanges.logs);

  const searchParams = useSearchParams();
  const urlFilter = searchParams.get("filter") ?? "all";
  const urlSearch = searchParams.get("search") ?? "";

  useEffect(() => {
    dispatch(fetchDevices());
  }, [dispatch]);

  // Background refresh every 60 seconds without blocking UI
  useEffect(() => {
    const interval = setInterval(() => {
      // Silent refresh without showing loading state
      dispatch(fetchDevices());
    }, 60000);
    return () => clearInterval(interval);
  }, [dispatch]);

  useEffect(() => {
    if (["online", "offline", "warning", "all", "mac-change"].includes(urlFilter)) {
      dispatch(
        setFilter(urlFilter as "all" | "online" | "offline" | "warning" | "mac-change")
      );
    }
    dispatch(setSearch(urlSearch));
  }, [urlFilter, urlSearch, dispatch]);

  const filteredDevices = useMemo(() => {
    let filtered = items;

    // Handle filter
    if (filter === "online") filtered = filtered.filter((d) => d.status === "online" || d.status === "up");
    else if (filter === "offline") filtered = filtered.filter((d) => d.status === "offline" || d.status === "down");
    else if (filter === "warning") filtered = filtered.filter((d) => d.status === "warning");
    else if (filter === "mac-change") {
      const allMacLogs = Object.values(macLogs).flat();
      const macChangeIds = allMacLogs.map((log) => log.device_id);
      filtered = filtered.filter((d) => macChangeIds.includes(d.id));
    }

    // Handle search
    if (search) {
      filtered = filtered.filter((d) => {
        const hostname = d.hostname ?? "";
        const lldpHostname = d.lldpHostname ?? "";
        const ip = d.ipAddress ?? "";
        return hostname.toLowerCase().includes(search.toLowerCase()) || 
               lldpHostname.toLowerCase().includes(search.toLowerCase()) || 
               ip.includes(search);
      });
    }

    return filtered;
  }, [items, filter, search, macLogs]);

  const handleAddDevice = async (device: Partial<Device>) => {
    try {
      await createDevice(device);
      dispatch(fetchDevices());
    } catch (error) {
      console.error("Failed to add device:", error);
    }
  };

  const handleDeleteDevice = async (id: number) => {
    try {
      await import("@/lib/api").then((api) => api.deleteDevice(id));
      dispatch(fetchDevices());
    } catch (error) {
      console.error("Failed to delete device:", error);
    }
  };

  const onlineCount = items.filter((d) => d.status === "online" || d.status === "up").length;
  const offlineCount = items.filter((d) => d.status === "offline" || d.status === "down").length;
  const warningCount = items.filter((d) => d.status === "warning").length;
  const totalCount = items.length;

  function emptyMessage() {
    if (filter === "online") return "No devices are online.";
    if (filter === "offline") return "No devices are offline.";
    if (filter === "warning") return "No devices with warnings.";
    if (filter === "mac-change") return "No MAC changes detected on any devices.";
    return "No devices found.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground">Manage your network inventory</p>
          <div className="flex gap-4 mt-2 text-sm">
            <span className="px-2 py-1 rounded font-medium text-gray-700 bg-gray-100">
              Total: {totalCount}
            </span>
            <span className={`px-2 py-1 rounded font-medium ${getStatusColor("online")}`}>
              Online: {onlineCount}
            </span>
            <span className={`px-2 py-1 rounded font-medium ${getStatusColor("offline")}`}>
              Offline: {offlineCount}
            </span>
            <span className={`px-2 py-1 rounded font-medium ${getStatusColor("warning")}`}>
              Warning: {warningCount}
            </span>
          </div>
        </div>
        <AddDeviceDialog onAdd={handleAddDevice} />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search devices..."
            className="pl-9"
            value={search}
            onChange={(e) => dispatch(setSearch(e.target.value))}
          />
        </div>
        <Select value={filter} onValueChange={(value) => dispatch(setFilter(value as "all" | "online" | "offline" | "warning" | "mac-change"))}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="mac-change">MAC Changes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading devices...</div>
      ) : filteredDevices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">{emptyMessage()}</div>
      ) : (
        <DeviceGrid devices={filteredDevices} onDelete={handleDeleteDevice} />
      )}
    </div>
  );
}
