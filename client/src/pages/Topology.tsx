import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchDevices } from '@/features/devices/devicesSlice';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RefreshCw, Move } from 'lucide-react';
import { getTopology } from '@/lib/api';
import { Device } from '@/lib/types';

interface TopologyData {
  nodes: Array<{
    id: number;
    label: string;
    type: string;
    status: string | null;
    ipAddress: string;
  }>;
  edges: Array<{
    id: number;
    source: number;
    target: number;
    sourceInterface: string | null;
    targetInterface: string | null;
  }>;
}

export default function Topology() {
  const dispatch = useDispatch<AppDispatch>();
  const devices = useSelector((state: RootState) => state.devices.items);
  
  const [zoom, setZoom] = useState(1);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load devices from Redux or fetch if needed
    if (devices.length === 0) {
      dispatch(fetchDevices());
    }
    // Load topology immediately
    loadTopology();
  }, [dispatch, devices.length]);

  const loadTopology = async () => {
    try {
      setLoading(true);
      const topoData = await getTopology();
      setTopology(topoData);
    } catch (error) {
      console.error('Failed to load topology:', error);
    } finally {
      setLoading(false);
    }
  };

  const getNodePosition = (index: number, total: number) => {
    const centerX = 400;
    const centerY = 300;
    const radius = 200;
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  };

  // Filter out pseudo-nodes (negative IDs) and keep only real devices
  const allNodes = topology?.nodes || [];
  const deviceNodes = allNodes.filter(node => node.id > 0 && node.type === 'device');
  
  // Filter edges to show only device-to-device connections
  const allEdges = topology?.edges || [];
  const deviceEdges = allEdges.filter(edge => {
    const sourceExists = deviceNodes.some(n => n.id === edge.source);
    const targetExists = deviceNodes.some(n => n.id === edge.target);
    return sourceExists && targetExists;
  });

  // Merge bidirectional links into a single edge per device-pair and collect interfaces for each side
  const mergedEdges = (() => {
    const map = new Map<string, {
      id: string;
      source: number;
      target: number;
      sourceIfs: string[];
      targetIfs: string[];
    }>();

    for (const edge of deviceEdges) {
      const a = edge.source;
      const b = edge.target;
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      const key = `${min}-${max}`;

      if (!map.has(key)) {
        map.set(key, { id: key, source: min, target: max, sourceIfs: [], targetIfs: [] });
      }

      const entry = map.get(key)!;

      // Determine which side the edge's interfaces belong to in the canonical ordering
      if (edge.source === entry.source && edge.target === entry.target) {
        if (edge.sourceInterface) entry.sourceIfs.push(edge.sourceInterface);
        if (edge.targetInterface) entry.targetIfs.push(edge.targetInterface);
      } else if (edge.source === entry.target && edge.target === entry.source) {
        // reversed direction: swap
        if (edge.sourceInterface) entry.targetIfs.push(edge.sourceInterface);
        if (edge.targetInterface) entry.sourceIfs.push(edge.targetInterface);
      }
    }

    // Deduplicate interface names
    return Array.from(map.values()).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceInterface: Array.from(new Set(e.sourceIfs)).join(', '),
      targetInterface: Array.from(new Set(e.targetIfs)).join(', '),
    }));
  })();

  const nodePositions = deviceNodes.reduce((acc, node, index) => {
    acc[node.id] = getNodePosition(index, deviceNodes.length);
    return acc;
  }, {} as Record<number, { x: number; y: number }>);

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Topology</h1>
          <p className="text-muted-foreground">Logical Layer 3 Map (LLDP/CDP)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(z + 0.1, 2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Move className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={loadTopology}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Rediscover
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden bg-muted/10 relative border-2 border-dashed min-h-[500px]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            Loading topology...
          </div>
        ) : deviceNodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            No topology data available. Add devices and links to see the network map.
          </div>
        ) : (
          <div 
            className="absolute inset-0 transition-transform duration-200 ease-out origin-center"
            style={{ transform: `scale(${zoom})` }}
          >
            <svg className="w-full h-full pointer-events-none">
              {mergedEdges.map((edge) => {
                const srcPos = nodePositions[edge.source];
                const dstPos = nodePositions[edge.target];
                if (!srcPos || !dstPos) return null;

                // positions for interface labels near each end (15% from source, 85% from source)
                const srcLabelX = srcPos.x + (dstPos.x - srcPos.x) * 0.15;
                const srcLabelY = srcPos.y + (dstPos.y - srcPos.y) * 0.15;
                const dstLabelX = srcPos.x + (dstPos.x - srcPos.x) * 0.85;
                const dstLabelY = srcPos.y + (dstPos.y - srcPos.y) * 0.85;

                return (
                  <g key={edge.id}>
                    <line
                      x1={srcPos.x}
                      y1={srcPos.y}
                      x2={dstPos.x}
                      y2={dstPos.y}
                      stroke="hsl(var(--border))"
                      strokeWidth="2"
                    />
                    <circle cx={(srcPos.x + dstPos.x) / 2} cy={(srcPos.y + dstPos.y) / 2} r="3" fill="hsl(var(--muted-foreground))" />

                    {/* Source-side interface label */}
                    {edge.sourceInterface && (
                      <text
                        x={srcLabelX}
                        y={srcLabelY - 6}
                        fontSize="10"
                        fill="hsl(var(--muted-foreground))"
                        textAnchor="start"
                      >
                        {edge.sourceInterface}
                      </text>
                    )}

                    {/* Target-side interface label */}
                    {edge.targetInterface && (
                      <text
                        x={dstLabelX}
                        y={dstLabelY + 10}
                        fontSize="10"
                        fill="hsl(var(--muted-foreground))"
                        textAnchor="end"
                      >
                        {edge.targetInterface}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            
            {deviceNodes.map((node) => {
              const pos = nodePositions[node.id];
              if (!pos) return null;
              
              // Find device from Redux to get lldp_hostname
              const device = devices.find(d => d.id === node.id);
              
              return (
                <div
                  key={node.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer group"
                  style={{ left: pos.x, top: pos.y }}
                >
                  <div className={`
                    w-12 h-12 rounded-full border-2 flex items-center justify-center bg-card shadow-lg transition-all group-hover:scale-110
                    ${node.status === 'up' || node.status === 'online' ? 'border-green-500 shadow-green-500/20' : 
                      node.status === 'warning' ? 'border-orange-500 shadow-orange-500/20' : 
                      'border-red-500 shadow-red-500/20'}
                  `}>
                    <span className="text-xs font-bold text-foreground">{node.type?.[0] || '?'}</span>
                  </div>
                  <div className="mt-2 bg-card/80 backdrop-blur px-2 py-1 rounded text-xs font-medium border shadow-sm whitespace-nowrap">
                    {node.label}
                  </div>
                  {device?.lldpHostname && (
                    <div className="text-[10px] text-gray-500 font-normal">
                      LLDP: {device.lldpHostname}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">{node.ipAddress}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
