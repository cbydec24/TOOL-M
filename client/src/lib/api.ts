// ------------------------------------------------------------
// FULL UPDATED api.ts — MATCHED WITH YOUR BACKEND
// ------------------------------------------------------------

const API_BASE = "http://127.0.0.1:8000";

// Utility function to convert snake_case to camelCase
function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase());
}

// Optimized shallow key conversion for flat objects (like Device)
function convertKeysToCamelCaseShallow(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (item !== null && typeof item === 'object' && item.constructor === Object) {
        const newObj: any = {};
        for (const key in item) {
          if (item.hasOwnProperty(key)) {
            newObj[toCamelCase(key)] = item[key];
          }
        }
        return newObj;
      }
      return item;
    });
  }
  if (obj !== null && typeof obj === 'object' && obj.constructor === Object) {
    const newObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        newObj[toCamelCase(key)] = obj[key];
      }
    }
    return newObj;
  }
  return obj;
}

// Deep conversion for complex nested objects (fallback)
function convertKeysToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase);
  }
  if (obj !== null && typeof obj === 'object' && obj.constructor === Object) {
    const newObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const camelKey = toCamelCase(key);
        const value = obj[key];
        newObj[camelKey] = convertKeysToCamelCase(value);
      }
    }
    return newObj;
  }
  return obj;
}

// Generic GET wrapper
async function api(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API Error: ${res.status} ${path}`);
  return res.json();
}

// Generic POST wrapper
async function apiPost(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API POST Error: ${res.status} ${path}`);
  return res.json();
}

// Generic PUT wrapper
async function apiPut(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API PUT Error: ${res.status} ${path}`);
  return res.json();
}

// Generic DELETE wrapper
async function apiDelete(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`API DELETE Error: ${res.status} ${path}`);
  return res.json();
}

// ------------------------------------------------------------
// DEVICE APIs
// ------------------------------------------------------------

export const getDevices = async () => {
  const data = await api("/devices");
  return convertKeysToCamelCaseShallow(data);
};

// Get only devices that changed since a given timestamp (for incremental sync)
export const getDeviceChanges = async (timestamp: string) => {
  const data = await api(`/devices/changes/since/${encodeURIComponent(timestamp)}`);
  return {
    changed: convertKeysToCamelCaseShallow(data.changed),
    timestamp: data.timestamp,
  };
};

export const getDevice = async (id: number) => {
  const data = await api(`/devices/${id}`);
  return convertKeysToCamelCase(data);
};
export const createDevice = async (data: any) => {
  const res = await apiPost("/devices", data);
  return convertKeysToCamelCase(res);
};
export const updateDevice = async (id: number, data: any) => {
  const res = await apiPut(`/devices/${id}`, data);
  return convertKeysToCamelCase(res);
};
export const deleteDevice = (id: number) => apiDelete(`/devices/${id}`);

// Connectivity test endpoints
export const testConnectivity = (data: any) => apiPost("/devices/test/connectivity", data);
export const testSNMP = (data: any) => apiPost("/devices/test/snmp", data);
export const testSSH = (data: any) => apiPost("/devices/test/ssh", data);

export const getDeviceInterfaces = async (deviceId: number) => {
  const data = await api(`/devices/${deviceId}/interfaces`);
  return convertKeysToCamelCase(data);
};

export const getInterface = (id: number) => api(`/interfaces/${id}`);

export const getDeviceStats = async (deviceId: number) => {
  const data = await api(`/devices/${deviceId}/stats`);
  return convertKeysToCamelCase(data);
};

export const getInterfaceStats = async (interfaceId: number) => {
  const data = await api(`/interfaces/${interfaceId}/stats`);
  return convertKeysToCamelCase(data);
};

export const getLatestStats = async () => {
  const data = await api(`/stats/latest`);
  return convertKeysToCamelCase(data);
};


// ------------------------------------------------------------
// ALERT APIs
// ------------------------------------------------------------

export const getAlerts = async () => {
  const data = await api("/alerts");
  return convertKeysToCamelCase(data);
};

export const getDeviceAlerts = async (deviceId: number) => {
  const data = await api(`/alerts/device/${deviceId}`);
  return convertKeysToCamelCase(data);
};
export const createAlert = (data: any) => apiPost("/alerts", data);


// ------------------------------------------------------------
// SITES APIs
// ------------------------------------------------------------

export const getSites = async () => {
  const data = await api("/sites");
  return convertKeysToCamelCase(data);
};

export const getSite = async (id: number) => {
  const data = await api(`/sites/${id}`);
  return convertKeysToCamelCase(data);
};
export const createSite = async (data: any) => {
  const res = await apiPost("/sites", data);
  return convertKeysToCamelCase(res);
};
export const updateSite = (id: number, data: any) =>
  apiPut(`/sites/${id}`, data);
export const deleteSite = (id: number) => apiDelete(`/sites/${id}`);


// ------------------------------------------------------------
// TOPOLOGY APIs
// ------------------------------------------------------------

// Your backend exposes:
//   /api/topology/links
//   /api/topology/graph

export const getTopologyLinks = async () => {
  const data = await api("/topology/links");
  return convertKeysToCamelCaseShallow(data);
};

export const getTopologyGraph = async () => {
  const data = await api("/topology/graph");
  return convertKeysToCamelCaseShallow(data);
};

// Cache for topology data to avoid refetching on page revisit
let topologyCache: any = null;
let topologyCacheTime = 0;
const TOPOLOGY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getTopology(forceRefresh = false) {
  const now = Date.now();
  
  // Return cached data if still valid and not forced refresh
  if (topologyCache && !forceRefresh && (now - topologyCacheTime) < TOPOLOGY_CACHE_TTL) {
    return topologyCache;
  }

  const [graph, links] = await Promise.all([
    getTopologyGraph(),
    getTopologyLinks(),
  ]);

  topologyCache = {
    nodes: graph.nodes,
    edges: graph.edges,
    links: links,
  };
  topologyCacheTime = now;
  
  return topologyCache;
}


// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------

export const healthCheck = () => api("/health");


// ------------------------------------------------------------
// EXPORT DEFAULT (optional)
// ------------------------------------------------------------

export default {
  api,
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceInterfaces,
  getInterface,
  getDeviceStats,
  getInterfaceStats,
  getLatestStats,

  getAlerts,
  getDeviceAlerts,
  createAlert,

  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,

  getTopologyLinks,
  getTopologyGraph,
  getTopology,

  healthCheck,
};
