import { NetworkInterface } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InterfaceGridProps {
  interfaces: NetworkInterface[];
}

export function InterfaceGrid({ interfaces }: InterfaceGridProps) {
  if (!interfaces || interfaces.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">No interfaces found.</div>
    );
  }

  const allowedPrefixes = [
    'gi', 'gigabitethernet', 'te', 'tengigabitethernet', 'twe', 'twentyfivegige',
    'fo', 'fortygigabitethernet', 'hu', 'hundredgige', 'fa', 'fastethernet',
    'eth', 'ethernet', 'po', 'port-channel', 'vlan', 'vl', 'lo', 'loopback',
    'tu', 'tunnel', 'mgmt', 'management'
  ];

  const filteredInterfaces = interfaces.filter(iface => {
    const name = (iface.interfaceName || '').trim().toLowerCase();
    if (!name) return false;
    return allowedPrefixes.some(pref => name.startsWith(pref));
  });

  // Natural sort for human-friendly numeric ordering (e.g., Gi1/0/2 before Gi1/0/10)
  const tokenize = (s: string) => {
    const re = /(\d+)|(\D+)/g;
    const tokens: Array<number|string> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      if (m[1] !== undefined) tokens.push(Number(m[1]));
      else if (m[2] !== undefined) tokens.push(m[2].toLowerCase());
    }
    return tokens;
  };

  const naturalCompare = (a: string, b: string) => {
    if (a === b) return 0;
    const ta = tokenize(a);
    const tb = tokenize(b);
    const len = Math.max(ta.length, tb.length);
    for (let i = 0; i < len; i++) {
      const va = ta[i];
      const vb = tb[i];
      if (va === undefined) return -1;
      if (vb === undefined) return 1;
      if (typeof va === 'number' && typeof vb === 'number') {
        if (va !== vb) return va - vb;
        continue;
      }
      const sa = String(va);
      const sb = String(vb);
      if (sa !== sb) return sa.localeCompare(sb);
    }
    return 0;
  };

  const sortedFiltered = filteredInterfaces.slice().sort((a, b) => naturalCompare((a.interfaceName || '').toLowerCase(), (b.interfaceName || '').toLowerCase()));

  // Categorize interfaces
  const getInterfaceType = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('vlan') || lower.startsWith('vl')) return 'vlan';
    if (lower.startsWith('ethernet') || lower.startsWith('gigabit') || lower.startsWith('tengigabit') || lower.startsWith('eth') || lower.startsWith('gi') || lower.startsWith('te')) return 'ethernet';
    if (lower.startsWith('port-channel') || lower.startsWith('po')) return 'portchannel';
    if (lower.startsWith('loopback') || lower.startsWith('lo')) return 'loopback';
    if (lower.startsWith('tunnel') || lower.startsWith('tu')) return 'tunnel';
    return 'other';
  };

  const getShortIdentifier = (iface: NetworkInterface) => {
    const type = getInterfaceType(iface.interfaceName || '');
    const name = iface.interfaceName || '';
    
    if (type === 'vlan') {
      // Extract just the VLAN number
      const match = name.match(/\d+/);
      return match ? match[0] : 'V';
    } else if (type === 'ethernet' || type === 'gigabit' || type === 'tengigabit') {
      // Extract port number (e.g., "1/0/1" -> "1")
      const parts = name.split(/[\//]/);
      return parts[parts.length - 1];
    } else if (type === 'portchannel') {
      const match = name.match(/\d+/);
      return match ? match[0] : 'PC';
    }
    return name.substring(0, 2);
  };

  // Separate VLANs and Interfaces from the filtered list
  const vlanInterfaces = sortedFiltered.filter(i => getInterfaceType(i.interfaceName || '') === 'vlan');
  const stackPorts = sortedFiltered.filter(i => getInterfaceType(i.interfaceName || '') === 'stack');
  const regularInterfaces = sortedFiltered.filter(i => {
    const type = getInterfaceType(i.interfaceName || '');
    return type !== 'vlan' && type !== 'stack' && type !== 'loopback' && type !== 'tunnel';
  });

  const upCount = sortedFiltered.filter(i => i.status === 'up').length;
  const downCount = sortedFiltered.filter(i => i.status === 'down').length;
  
  // VLAN and Interface specific counts for the small summary below the overview
  const vlanTotal = vlanInterfaces.length;
  const vlanUp = vlanInterfaces.filter(i => i.status === 'up').length;
  const vlanDown = vlanInterfaces.filter(i => i.status === 'down').length;

  const ifaceTotal = regularInterfaces.length;
  const ifaceUp = regularInterfaces.filter(i => i.status === 'up').length;
  const ifaceDown = regularInterfaces.filter(i => i.status === 'down').length;

  const renderInterfaceBox = (iface: NetworkInterface) => {
    const isUp = iface.status === 'up';
    const type = getInterfaceType(iface.interfaceName || '');
    const identifier = getShortIdentifier(iface);
    
    // Different shapes and styles for different interface types
    const getShapeStyles = () => {
      switch(type) {
        case 'vlan':
          // Oval/eclipse shape for VLAN
          return 'rounded-full w-12 h-6 px-2 py-0.5';
        case 'portchannel':
          // Hexagon-like (use padding/border for effect)
          return 'rounded w-8 h-8 px-1 py-0.5';
        case 'stack':
          // Rectangle for stack
          return 'rounded-sm w-8 h-8 px-1 py-0.5';
        default:
          // Regular square for ethernet
          return 'rounded-md w-8 h-8 px-1 py-0.5';
      }
    };

    return (
      <Tooltip key={iface.id}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center justify-center cursor-pointer transition-all hover:scale-125 font-mono text-xs font-bold border-2 shadow-md hover:shadow-xl',
              'duration-200 ease-in-out transform',
              getShapeStyles(),
              isUp
                ? 'bg-gradient-to-br from-green-400 to-green-600 hover:from-green-300 hover:to-green-700 border-green-700 text-white drop-shadow-lg hover:drop-shadow-2xl'
                : 'bg-gradient-to-br from-red-400 to-red-600 hover:from-red-300 hover:to-red-700 border-red-700 text-white drop-shadow-lg hover:drop-shadow-2xl'
            )}
          >
            {identifier}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div className="font-semibold">{iface.interfaceName}</div>
            <div>Type: {type}</div>
            <div>Status: {iface.status}</div>
            <div>Speed: {iface.speedBps ? `${(iface.speedBps / 1000000).toFixed(1)} Mbps` : '-'}</div>
            <div>MAC: {iface.macAddress || '-'}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary stats - VLANs and Interfaces separated */}
      <div className="grid grid-cols-4 gap-2 text-sm">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2 text-center">
          <div className="text-green-700 dark:text-green-400 font-semibold">{vlanUp}</div>
          <div className="text-green-600 dark:text-green-500 text-xs">VLAN Up</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-center">
          <div className="text-red-700 dark:text-red-400 font-semibold">{vlanDown}</div>
          <div className="text-red-600 dark:text-red-500 text-xs">VLAN Down</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2 text-center">
          <div className="text-green-700 dark:text-green-400 font-semibold">{ifaceUp}</div>
          <div className="text-green-600 dark:text-green-500 text-xs">Ifaces Up</div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-center">
          <div className="text-red-700 dark:text-red-400 font-semibold">{ifaceDown}</div>
          <div className="text-red-600 dark:text-red-500 text-xs">Ifaces Down</div>
        </div>
      </div>

      

      <TooltipProvider>
        {/* VLAN Section */}
        {vlanInterfaces.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              VLANs ({vlanInterfaces.length})
            </div>
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700">
              {vlanInterfaces.map(renderInterfaceBox)}
            </div>
          </div>
        )}

        {/* Stack Ports Section */}
        {stackPorts.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Stack Ports ({stackPorts.length})
            </div>
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700">
              {stackPorts.map(renderInterfaceBox)}
            </div>
          </div>
        )}

        {/* Interfaces Section */}
        {regularInterfaces.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Interfaces ({regularInterfaces.length})
            </div>
            <div className="flex flex-wrap gap-2 p-2 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700">
              {regularInterfaces.map(renderInterfaceBox)}
            </div>
          </div>
        )}
      </TooltipProvider>
    </div>
  );
}

export default InterfaceGrid;

