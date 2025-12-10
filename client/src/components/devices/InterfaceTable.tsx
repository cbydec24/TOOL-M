import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NetworkInterface } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InterfaceTableProps {
  interfaces: NetworkInterface[];
  showAdvanced?: boolean;
}

export function InterfaceTable({ interfaces, showAdvanced = false }: InterfaceTableProps) {
  const allowedPrefixes = [
    'gi', 'gigabitethernet', 'te', 'tengigabitethernet', 'twe', 'twentyfivegige',
    'fo', 'fortygigabitethernet', 'hu', 'hundredgige', 'fa', 'fastethernet',
    'eth', 'ethernet', 'po', 'port-channel', 'vlan', 'vl', 'lo', 'loopback',
    'tu', 'tunnel', 'mgmt', 'management'
  ];

  const filteredInterfaces = interfaces.filter((iface) => {
    const name = (iface.interfaceName || '').trim().toLowerCase();
    if (!name) return false;
    return allowedPrefixes.some(pref => name.startsWith(pref));
  });

  if (filteredInterfaces.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        No interfaces found for this device.
      </div>
    );
  }

  const upCount = filteredInterfaces.filter(i => i.status === 'up').length;
  const downCount = filteredInterfaces.filter(i => i.status === 'down').length;

  // Natural sort: split into numeric and non-numeric tokens for human-friendly ordering
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

  const sortedInterfaces = filteredInterfaces.slice().sort((x, y) => {
    const a = (x.interfaceName || '').trim();
    const b = (y.interfaceName || '').trim();
    return naturalCompare(a.toLowerCase(), b.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Summary cards - Dark theme */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 font-medium">Total</div>
          <div className="text-3xl font-bold text-slate-100 mt-1">{interfaces.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-green-400 font-medium">Up</div>
          <div className="text-3xl font-bold text-green-400 mt-1">{upCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-red-400 font-medium">Down</div>
          <div className="text-3xl font-bold text-red-400 mt-1">{downCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-amber-400 font-medium">Error Rate</div>
          <div className="text-3xl font-bold text-amber-400 mt-1">
            {(downCount / interfaces.length * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Dark theme table */}
      <div className="rounded-lg border border-slate-700 overflow-hidden bg-slate-950">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-700 hover:bg-slate-900/50 bg-slate-900">
              <TableHead className="w-[200px] font-bold text-slate-100">Interface</TableHead>
              <TableHead className="font-bold text-slate-100">Status</TableHead>
              <TableHead className="font-bold text-slate-100">Description</TableHead>
              <TableHead className="font-bold text-slate-100">Speed</TableHead>
              <TableHead className="font-bold text-slate-100">MTU</TableHead>
              <TableHead className="font-bold text-slate-100">MAC Address</TableHead>
              {showAdvanced && <TableHead className="font-bold text-slate-100">In Errors</TableHead>}
              {showAdvanced && <TableHead className="font-bold text-slate-100">Out Errors</TableHead>}
              {showAdvanced && <TableHead className="font-bold text-slate-100">CRC Errors</TableHead>}
            </TableRow>
          </TableHeader>

          <TableBody>
            {sortedInterfaces.map((iface, idx) => {
              const isUp = iface.status === 'up';
              return (
                <TableRow
                  key={iface.id}
                  className={cn(
                    "border-b border-slate-700 hover:bg-slate-800/50 transition-colors",
                    idx % 2 === 0 ? "bg-slate-950" : "bg-slate-900/50"
                  )}
                >
                  {/* Interface Name */}
                  <TableCell className="font-mono text-sm font-semibold text-slate-100">
                    {iface.interfaceName || 'N/A'}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      className={cn(
                        "font-semibold text-xs",
                        isUp
                          ? "bg-green-900 text-green-300 border border-green-700"
                          : "bg-red-900 text-red-300 border border-red-700"
                      )}
                    >
                      {(iface.status || 'unknown').toUpperCase()}
                    </Badge>
                  </TableCell>

                  {/* Description */}
                  <TableCell className="text-slate-400 text-sm max-w-[250px] truncate">
                    {iface.description || '-'}
                  </TableCell>

                  {/* Speed */}
                  <TableCell className="font-mono text-sm font-semibold text-slate-200">
                    {iface.speedBps ? `${(iface.speedBps / 1000000).toFixed(1)} Mbps` : '-'}
                  </TableCell>

                  {/* MTU */}
                  <TableCell className="text-slate-300 text-sm">
                    {iface.mtu || '-'}
                  </TableCell>

                  {/* MAC Address */}
                  <TableCell className="font-mono text-xs text-slate-400">
                    {iface.macAddress || '-'}
                  </TableCell>

                  {showAdvanced && (
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-xs",
                          iface.inputErrors
                            ? "bg-red-900/20 text-red-300 border-red-700"
                            : "bg-slate-800 text-slate-400 border-slate-600"
                        )}
                      >
                        {iface.inputErrors ?? 0}
                      </Badge>
                    </TableCell>
                  )}

                  {showAdvanced && (
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-xs",
                          iface.outputErrors
                            ? "bg-red-900/20 text-red-300 border-red-700"
                            : "bg-slate-800 text-slate-400 border-slate-600"
                        )}
                      >
                        {iface.outputErrors ?? 0}
                      </Badge>
                    </TableCell>
                  )}

                  {showAdvanced && (
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-xs",
                          iface.crcErrors
                            ? "bg-red-900/20 text-red-300 border-red-700"
                            : "bg-slate-800 text-slate-400 border-slate-600"
                        )}
                      >
                        {iface.crcErrors ?? 0}
                      </Badge>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

