import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, Shield, ArrowLeft, RefreshCw, Settings } from "lucide-react";
import { Link } from "wouter";
import { InterfaceTable } from '@/components/devices/InterfaceTable';
import { DeviceStats } from '@/components/devices/DeviceStats';
import InterfaceGrid from '@/components/devices/InterfaceGrid';
import { getDevice, getDeviceInterfaces, getDeviceAlerts, getDeviceStats } from '@/lib/api';
import { Device, NetworkInterface, Alert } from '@/lib/types';

const POLL_INTERVAL = 30000; // 30 seconds

export default function DeviceDetail() {
  const params = useParams();
  const id = Number(params.id ?? NaN);

  const [device, setDevice] = useState<Device | null>(null);
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Try to populate from Redux store first (fast) then fetch full details
  const storeDevice = useSelector((s: RootState) => s.devices.items.find((d) => d.id === id) ?? null);

  useEffect(() => {
    if (!id || isNaN(id)) return;

    if (storeDevice) {
      setDevice(storeDevice);
    }

    let interval: number;

    const loadDeviceData = async () => {
      setLoading(true);
      try {
        const [deviceData, interfacesData, alertsData, statsData] = await Promise.all([
          getDevice(id),
          getDeviceInterfaces(id),
          getDeviceAlerts(id),
          getDeviceStats(id).catch(() => null),
        ]);
        setDevice(deviceData);
        setInterfaces(interfacesData);
        setAlerts(alertsData);
        setStats(statsData || null);
      } catch (error) {
        console.error('Failed to load device:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDeviceData();

    // Poll interfaces and alerts every POLL_INTERVAL ms
    interval = window.setInterval(async () => {
      try {
        const [latestInterfaces, latestAlerts, latestStats] = await Promise.all([
          getDeviceInterfaces(id),
          getDeviceAlerts(id),
          getDeviceStats(id).catch(() => null),
        ]);
        setInterfaces(latestInterfaces);
        setAlerts(latestAlerts);
        setStats(latestStats || null);
      } catch (error) {
        console.error('Failed to refresh device data:', error);
      }
    }, POLL_INTERVAL);

    return () => window.clearInterval(interval);
  }, [id]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading device...</div>;
  }

  if (!device) {
    return <div className="text-center py-8 text-muted-foreground">Device not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/devices">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {device.hostname || 'Unknown'}
              <Badge
                variant="outline"
                className={
                  device.status === 'online'
                    ? "text-green-500 border-green-500"
                    : "text-red-500 border-red-500"
                }
              >
                {(device.status || 'unknown').toUpperCase()}
              </Badge>
            </h1>
            {device.lldpHostname && (
              <p className="text-sm text-gray-500 mt-1">
                LLDP Hostname: {device.lldpHostname}
              </p>
            )}
            <p className="text-muted-foreground font-mono text-sm mt-1">
              {(() => {
                const anyD = device as any;
                const displayIp = anyD.ipAddress ?? anyD.ip ?? anyD.ip_address ?? anyD.managementIp ?? '-';
                return `${displayIp} • ${device.model || 'Unknown'} • ${device.osVersion || 'Unknown'}`;
              })()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Interface counts placed beside SSH (device info removed from header) */}

          {/* Show only Last Seen timestamp in header as requested */}
          <div className="text-sm text-muted-foreground mr-2">
            Last Seen: {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}
          </div>

          <div className="flex gap-2">
            <Button variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Poll Now
            </Button>
            <Button variant="outline">
              <Terminal className="mr-2 h-4 w-4" />
              SSH
            </Button>
            <Button variant="outline">
              <Shield className="mr-2 h-4 w-4" />
              Backup
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

          <div className="grid gap-6 md:grid-cols-1">
        {/* LEFT COLUMN (stacked) */}
        <div className="space-y-6">
          <DeviceStats device={device} stats={stats} />

          {/* Device Information moved to header for condensed view */}
        </div>

        {/* RIGHT COLUMN (full width) */}
        <div>
          <Tabs defaultValue="interfaces" className="w-full">
            <TabsList>
              <TabsTrigger value="interfaces">Interfaces</TabsTrigger>
              <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
              <TabsTrigger value="config">Running Config</TabsTrigger>
            </TabsList>

            <TabsContent value="interfaces" className="mt-4">
              {/* Interface overview (horizontal) above the table for proper column widths */}
              {interfaces && interfaces.length > 0 && (
                <div className="mb-4">
                  <InterfaceGrid interfaces={interfaces} />
                </div>
              )}

              {/* Detailed interface list below the overview */}
              <InterfaceTable interfaces={interfaces} showAdvanced={true} />
            </TabsContent>

            <TabsContent value="alerts" className="mt-4">
              {alerts.length === 0 ? (
                <div className="rounded-md border p-8 text-center text-muted-foreground">
                  No active alerts for this device.
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-md border p-4">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            alert.severity === 'critical'
                              ? "border-red-500 text-red-500"
                              : alert.severity === 'warning'
                              ? "border-orange-500 text-orange-500"
                              : "border-blue-500 text-blue-500"
                          }
                        >
                          {(alert.severity || 'info').toUpperCase()}
                        </Badge>
                        <span className="font-medium">{alert.alertType}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="config" className="mt-4">
              <div className="rounded-md border bg-muted p-4 font-mono text-xs overflow-auto max-h-[500px]">
                <pre>{`!
version 16.12
no service pad
service timestamps debug datetime msec
service timestamps log datetime msec
!
hostname ${device.hostname || 'Unknown'}
!
interface GigabitEthernet1/0/1
 description Uplink to Core
 switchport mode trunk
!
interface GigabitEthernet1/0/2
 description User Access
 switchport mode access
 switchport access vlan 10
!
end`}</pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
