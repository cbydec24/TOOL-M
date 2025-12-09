// client/src/lib/types.ts

export interface Site {
  id: number;
  siteName: string;
  location: string | null;
  description: string | null;
  createdAt: string | null;
}

export interface Device {
  id: number;
  hostname: string | null;
  lldpHostname?: string | null;  // LLDP-discovered hostname (from neighbors)
  ipAddress: string;
  siteId: number | null;
  deviceType: string;
  vendor: string | null;
  model: string | null;
  osVersion: string | null;
  snmpVersion: string | null;
  snmpCommunity: string | null;
  status: "online" | "offline" | "warning" | null;
  lastSeen: string | null;
  sshEnabled: boolean | null;
  sshUsername: string | null;
  sshPassword: string | null;
  sshPort: number | null;
}

export interface NetworkInterface {
  id: number;
  deviceId: number | null;
  interfaceName: string | null;
  description: string | null;
  macAddress: string | null;
  status: "up" | "down" | "unknown" | null;
  speedBps: number | null;
  mtu: number | null;

  inputErrors?: number | null;
  outputErrors?: number | null;
  crcErrors?: number | null;
  inBps?: number | null;
  outBps?: number | null;

  previousMac?: string | null;
  currentMac?: string | null;

  previousStatus?: "up" | "down" | "unknown" | null;
  currentStatus?: "up" | "down" | "unknown" | null;
}

export interface InterfaceStat {
  id: number;
  interfaceId: number | null;
  timestamp: string | null;
  inBps: number | null;
  outBps: number | null;
}

export interface Alert {
  id: number;
  deviceId: number | null;
  interfaceId: number | null;
  alertType: string | null;
  severity: string | null;
  message: string | null;
  timestamp: string | null;

  previousValue?: string | null;
  currentValue?: string | null;
}

export interface TopologyLink {
  id: number;
  srcDeviceId: number | null;
  srcInterface: string | null;
  dstDeviceId: number | null;
  dstInterface: string | null;
  lastSeen: string | null;
}

export interface TopologyNode {
  id: string;
  data: {
    label: string;
    type: string;
    status: string | null;
    ipAddress: string;
    vendor: string | null;
    model: string | null;
  };
  position: { x: number; y: number };
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
