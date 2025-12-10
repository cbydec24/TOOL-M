import { Device } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface SiteDeviceGridProps {
  devices: Device[];
  search?: string;
  onSearchChange?: (value: string) => void;
}

export function SiteDeviceGrid({ devices, search = "", onSearchChange }: SiteDeviceGridProps) {
  if (devices.length === 0) {
    return (
      <div className="space-y-4">
        {onSearchChange && (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search devices..."
              defaultValue={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-muted/50 pl-9 border-transparent focus-visible:bg-background focus-visible:border-primary focus-visible:ring-0"
            />
          </div>
        )}
        <div className="text-center py-12 text-muted-foreground">
          {search ? "No devices match your search." : "No devices assigned to this site."}
        </div>
      </div>
    );
  }

  const getStatusStyles = (status: string | null) => {
    switch (status) {
      case "online":
        return "bg-gradient-to-r from-green-400 to-green-600 text-white hover:from-green-500 hover:to-green-700";
      case "offline":
        return "bg-gradient-to-r from-red-400 to-red-600 text-white hover:from-red-500 hover:to-red-700";
      case "warning":
        return "bg-gradient-to-r from-orange-400 to-orange-600 text-white hover:from-orange-500 hover:to-orange-700";
      default:
        return "bg-gradient-to-r from-gray-400 to-gray-600 text-white hover:from-gray-500 hover:to-gray-700";
    }
  };

  return (
    <div className="space-y-4">
      {onSearchChange && (
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search devices..."
            defaultValue={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-muted/50 pl-9 border-transparent focus-visible:bg-background focus-visible:border-primary focus-visible:ring-0"
          />
        </div>
      )}
      <div className="w-full overflow-auto border rounded-md">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Hostname</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">LLDP Hostname</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">IP Address</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Site</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id} className="border-b hover:bg-muted/50 cursor-pointer transition-colors">
                <td className="px-4 py-2">
                  <Link href={`/devices/${device.id}`} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                    {device.hostname || "Unknown"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{device.lldpHostname || "-"}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{device.ipAddress || "N/A"}</td>
                <td className="px-4 py-2 text-muted-foreground">{device.siteName || "-"}</td>
                <td className="px-4 py-2">
                  <Badge className={`font-bold text-xs py-1 px-3 ${getStatusStyles(device.status || null)}`}>
                    {(device.status || "unknown").toUpperCase()}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {devices.length === 0 && search && (
        <div className="text-center py-8 text-muted-foreground">
          No devices match your search.
        </div>
      )}
    </div>
  );
}
