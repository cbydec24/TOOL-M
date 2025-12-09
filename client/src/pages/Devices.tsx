// client/src/pages/Devices.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { setFilter, setSearch, setDeviceType } from "@/features/devices/devicesSlice";
import { DeviceGrid } from "@/components/devices/DeviceGrid";
import CompactDeviceGrid from "@/components/devices/CompactDeviceGrid";
import { AddDeviceDialog } from "@/components/devices/AddDeviceDialog";
import { Button } from "@/components/ui/button";
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
  const { items, filter, search, loading, deviceType } = useSelector((state: RootState) => state.devices);
  const macLogs = useSelector((state: RootState) => state.macChanges.logs);

  const searchParams = useSearchParams();
  const urlFilter = searchParams.get("filter") ?? "all";
  const urlSearch = searchParams.get("search") ?? "";

  const [localSearch, setLocalSearch] = useState(search);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Note: Initial device load and polling is handled globally in App.tsx
  // This page just manages local state for filters and search

  // Debounce search input (500ms delay)
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      dispatch(setSearch(localSearch));
    }, 500);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [localSearch, dispatch]);

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

    // Handle device type filter
    if (deviceType && deviceType !== "all") {
      const dt = deviceType.toLowerCase();
      filtered = filtered.filter((d) => (d.deviceType ?? "").toLowerCase() === dt);
    }

    return filtered;
  }, [items, filter, search, macLogs, deviceType]);

  // Fixed device type options (only these should be available)
  const DEVICE_TYPE_OPTIONS = useMemo(() => ["Router", "Switch", "Firewall", "Voice-Gateway", "Other"], []);

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

  // Count devices by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "Router": 0,
      "Switch": 0,
      "Firewall": 0,
      "Voice-Gateway": 0,
      "Other": 0,
    };
    items.forEach((d) => {
      // Normalize the type before counting
      const normalize = (raw?: string | null) => {
        if (!raw) return "Other";
        const s = raw.trim().toLowerCase();
        if (/^router$/i.test(s)) return "Router";
        if (/^switch(es)?$/i.test(s) || /^switch$/i.test(s)) return "Switch";
        if (/^firewall$/i.test(s)) return "Firewall";
        if (/voice[\s-]?gateway|voip gateway|voice gateway|voice-gw/i.test(s)) return "Voice-Gateway";
        if (/^ap$|access[-\s]?point/i.test(s)) return "Other";
        return "Other";
      };
      const type = normalize(d.deviceType);
      counts[type]++;
    });
    return counts;
  }, [items]);

  function emptyMessage() {
    if (filter === "online") return "No devices are online.";
    if (filter === "offline") return "No devices are offline.";
    if (filter === "warning") return "No devices with warnings.";
    if (filter === "mac-change") return "No MAC changes detected on any devices.";
    return "No devices found.";
  }

  const [viewMode, setViewMode] = useState<"cards" | "list-all">("cards");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Persist view mode in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('devices:viewMode');
      if (saved === 'cards' || saved === 'list-all') setViewMode(saved as any);
    } catch (e) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('devices:viewMode', viewMode); } catch (e) {}
  }, [viewMode]);

  const sortedDevices = useMemo(() => {
    if (!sortBy) return filteredDevices;
    const sorted = [...filteredDevices].sort((a, b) => {
      const va = ((a as any)[sortBy] ?? "") as any;
      const vb = ((b as any)[sortBy] ?? "") as any;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb));
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [filteredDevices, sortBy, sortDir]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  // CSV export of currently visible rows
  const exportCsv = () => {
    const rows = sortedDevices.map((d) => ({
      id: d.id,
      hostname: d.hostname ?? '',
      lldpHostname: d.lldpHostname ?? '',
      ipAddress: d.ipAddress ?? '',
      deviceType: d.deviceType ?? '',
      snmpVersion: d.snmpVersion ?? '',
      inBps: (d as any).interfaceIn ?? '',
      outBps: (d as any).interfaceOut ?? '',
      status: d.status ?? '',
      lastSeen: d.lastSeen ?? '',
    }));
    const header = Object.keys(rows[0] || {}).join(',') + '\n';
    const csv = header + rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devices-export-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground">Manage your network inventory</p>
          <div className="flex gap-4 mt-2 text-sm flex-wrap">
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
            {Object.entries(typeCounts).map(([type, count]) => (
              <span key={type} className="px-2 py-1 rounded font-medium text-blue-700 bg-blue-100">
                {type}: {count}
              </span>
            ))}
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
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
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
        {/* Device type filter */}
        <Select value={deviceType} onValueChange={(value) => dispatch(setDeviceType(value))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {DEVICE_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* View mode: cards or list all */}
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "list-all") }>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="View" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cards">Cards</SelectItem>
            <SelectItem value="list-all">List All Devices</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading devices...</div>
      ) : filteredDevices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">{emptyMessage()}</div>
      ) : viewMode === "list-all" ? (
        <CompactDeviceGrid devices={sortedDevices} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
      ) : (
        <DeviceGrid devices={sortedDevices} onDelete={handleDeleteDevice} />
      )}
    </div>
  );
}
