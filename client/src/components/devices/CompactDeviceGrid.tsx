import { Device } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Terminal } from "lucide-react";
import React from "react";

interface CompactDeviceGridProps {
  devices: Device[];
  sortBy?: string | null;
  sortDir?: "asc" | "desc";
  onSort?: (col: string) => void;
}

export function CompactDeviceGrid({ devices, sortBy, sortDir, onSort }: CompactDeviceGridProps) {
  const [, setLocation] = useLocation();
  const [colWidths, setColWidths] = React.useState({
    hostname: 140,
    lldpHostname: 120,
    ip: 130,
    type: 70,
    snmp: 50,
    bandwidth: 100,
    lastSeen: 130,
    ssh: 100,
  });

  const handleMouseDown = (col: keyof typeof colWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[col];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      setColWidths(prev => ({ ...prev, [col]: Math.max(50, startWidth + diff) }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  const getBandwidthColor = (inMbps?: number, outMbps?: number) => {
    const max = Math.max(inMbps || 0, outMbps || 0);
    if (max >= 800) return "bg-red-600";
    if (max >= 400) return "bg-orange-600";
    return "bg-green-600";
  };

  if (devices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">No devices to show.</div>
    );
  }

  return (
    <div className="w-full overflow-auto border rounded-md">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="border-b">
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.hostname}px` }}
              onClick={() => onSort?.('hostname')}
            >
              <span>Hostname {sortBy === 'hostname' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('hostname')}
              />
            </th>
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.lldpHostname}px` }}
              onClick={() => onSort?.('lldpHostname')}
            >
              <span>LLDP Host {sortBy === 'lldpHostname' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('lldpHostname')}
              />
            </th>
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.ip}px` }}
              onClick={() => onSort?.('ip')}
            >
              <span>IP {sortBy === 'ip' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('ip')}
              />
            </th>
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.type}px` }}
              onClick={() => onSort?.('type')}
            >
              <span>Type {sortBy === 'type' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('type')}
              />
            </th>
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.snmp}px` }}
              onClick={() => onSort?.('status')}
            >
              <span>SNMP {sortBy === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('snmp')}
              />
            </th>
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.bandwidth}px` }}
              onClick={() => onSort?.('interface_in')}
            >
              <span>BW {sortBy === 'interface_in' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('bandwidth')}
              />
            </th>
            <th
              className="px-2 py-1 text-left font-medium text-muted-foreground cursor-pointer relative"
              style={{ width: `${colWidths.lastSeen}px` }}
              onClick={() => onSort?.('last_seen')}
            >
              <span>Last Seen {sortBy === 'last_seen' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              <div
                className="absolute right-0 top-0 h-full w-1 bg-gray-300 cursor-col-resize hover:bg-blue-500"
                onMouseDown={handleMouseDown('lastSeen')}
              />
            </th>
            <th className="px-2 py-1 text-center font-medium text-muted-foreground" style={{ width: `${colWidths.ssh}px` }}>
              SSH / Status
            </th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const status = device.status === "online" ? "online" : "offline";
            const inMbps = (device as any).interfaceIn || 0;
            const outMbps = (device as any).interfaceOut || 0;
            const bwClass = getBandwidthColor(inMbps, outMbps);

            return (
              <tr
                key={device.id}
                onClick={() => setLocation(`/devices/${device.id}`)}
                className="border-b hover:bg-muted/30 cursor-pointer"
              >
                <td className="px-2 py-1 truncate font-medium" style={{ width: `${colWidths.hostname}px` }}>
                  {device.hostname || "Unknown"}
                </td>
                <td className="px-2 py-1 truncate text-muted-foreground" style={{ width: `${colWidths.lldpHostname}px` }}>
                  {device.lldpHostname || "-"}
                </td>
                <td className="px-2 py-1 truncate text-muted-foreground font-mono" style={{ width: `${colWidths.ip}px` }}>
                  {device.ipAddress || "-"}
                </td>
                <td className="px-2 py-1 truncate" style={{ width: `${colWidths.type}px` }}>
                  {device.deviceType || "-"}
                </td>
                <td className="px-2 py-1 text-center" style={{ width: `${colWidths.snmp}px` }}>
                  <span className={cn("inline-block w-2 h-2 rounded-full", status === "online" ? "bg-green-600" : "bg-red-600")} />
                </td>
                <td className="px-2 py-1" style={{ width: `${colWidths.bandwidth}px` }}>
                  <div className="flex items-center gap-1">
                    <div className={cn("h-3 w-6 rounded", bwClass)} />
                    <span className="text-xs font-medium">{Math.max(inMbps, outMbps).toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-2 py-1 truncate text-muted-foreground text-xs" style={{ width: `${colWidths.lastSeen}px` }}>
                  {formatDateTime(device.lastSeen)}
                </td>
                <td className="px-2 py-1 text-center" style={{ width: `${colWidths.ssh}px` }}>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = `toolssh://${device.sshUsername}@${device.ipAddress}:22`;
                        window.location.href = url;
                      }}
                      className="px-2 py-1 h-auto"
                      title="SSH to device"
                    >
                      <Terminal className="w-4 h-4" />
                    </Button>
                    <Badge
                      className={cn(
                        "text-white font-semibold text-xs capitalize",
                        status === "online" ? "bg-green-600" : "bg-red-600"
                      )}
                    >
                      {status}
                    </Badge>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CompactDeviceGrid;
