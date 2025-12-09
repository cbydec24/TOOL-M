import { Device } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal, Shield, Trash2, Activity, Server, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from 'wouter';
import { formatDistanceToNow, format } from "date-fns";

function safeFormatLastSeen(val?: string | null) {
  if (!val) return 'Never seen';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Never seen';
    return `Last seen ${formatDistanceToNow(d, { addSuffix: true })} (${format(d, 'Pp')})`;
  } catch (e) {
    return 'Never seen';
  }
}

interface DeviceGridProps {
  devices: Device[];
  onDelete: (id: number) => void;
}

export function DeviceGrid({ devices, onDelete }: DeviceGridProps) {
  if (devices.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No devices found. Add your first device to get started.
      </div>
    );
  }

  const [, setLocation] = useLocation();

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {devices.map((device) => (
        <Card key={device.id} className="overflow-hidden transition-all hover:shadow-md border-t-4 cursor-pointer"
          onClick={() => setLocation(`/devices/${device.id}`)}
          style={{ borderTopColor: 
            device.status === 'online' ? 'hsl(var(--status-online))' : 
            device.status === 'offline' ? 'hsl(var(--status-offline))' : 
            device.status === 'warning' ? 'hsl(var(--status-warning))' : 'hsl(var(--muted))' 
          }}
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                {device.hostname || 'Unknown'}
              </CardTitle>
              {device.lldpHostname && (
                <p className="text-xs text-gray-500 truncate max-w-[220px]">
                  LLDP: {device.lldpHostname}
                </p>
              )}
              {(() => {
                const anyD = device as any;
                const displayIp = anyD.ipAddress ?? anyD.ip ?? anyD.ip_address ?? anyD.managementIp ?? '-';
                return (
                  <p
                    className="text-sm font-mono text-muted-foreground truncate max-w-[220px]"
                    title={displayIp || ''}
                  >
                    {displayIp}
                  </p>
                );
              })()}
            </div>
            <Badge className={cn(
              "capitalize",
              device.status === 'online' && "bg-green-600 text-white border-green-600",
              device.status === 'offline' && "bg-red-600 text-white border-red-600",
              device.status === 'warning' && "bg-orange-600 text-white border-orange-600",
            )}>
              {device.status || 'unknown'}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground mt-2">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-foreground">SNMP</span>
                <span>{device.snmpVersion || 'N/A'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-medium text-foreground">Type</span>
                <span>{device.deviceType || 'Unknown'}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {safeFormatLastSeen(device.lastSeen)}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-3 flex justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Dashboard">
                <Activity className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="SSH Console">
                <Terminal className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Config Backup">
                <Shield className="h-4 w-4" />
              </Button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); onDelete(device.id); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
