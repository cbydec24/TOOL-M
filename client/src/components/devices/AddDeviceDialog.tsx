import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, CheckCircle, XCircle } from "lucide-react";
import { Device, Site } from "@/lib/types";
import { getSites, testConnectivity, testSNMP, testSSH } from "@/lib/api";

const deviceSchema = z.object({
  hostname: z.string().min(2, "Hostname must be at least 2 characters"),
  ipAddress: z.string().ip("Invalid IP address"),
  deviceType: z.string().min(1, "Device type is required"),
  siteId: z.string().min(1, "Site is required"),
  snmpVersion: z.string().optional(),
  snmpCommunity: z.string().optional(),
  sshUsername: z.string().optional(),
  sshPassword: z.string().optional(),
});

interface AddDeviceDialogProps {
  onAdd: (device: Partial<Device>) => void;
}

export function AddDeviceDialog({ onAdd }: AddDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [snmpTestResult, setSnmpTestResult] = useState<'success' | 'failure' | null>(null);
  const [sshTestResult, setSshTestResult] = useState<'success' | 'failure' | null>(null);
  const [allTestsCompleted, setAllTestsCompleted] = useState(false);

  const form = useForm<z.infer<typeof deviceSchema>>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      hostname: "",
      ipAddress: "",
      deviceType: "Switch",
      siteId: "",
      snmpVersion: "v2c",
      snmpCommunity: "public",
    },
  });

  useEffect(() => {
    let mounted = true;
    const loadSites = async () => {
      console.debug("AddDeviceDialog: loading sites...");
      try {
        const sitesData = await getSites();
        console.debug("AddDeviceDialog: getSites() returned:", sitesData);
        if (mounted) {
          setSites(Array.isArray(sitesData) ? sitesData : []);
          console.debug("AddDeviceDialog: setSites ->", Array.isArray(sitesData) ? sitesData.length : 0);
        }
      } catch (error) {
        console.error("AddDeviceDialog: Failed to load sites:", error);
        if (mounted) setSites([]);
      }
    };
    loadSites();
    return () => {
      mounted = false;
    };
  }, []);

  const runAllTests = async () => {
    const isValid = await form.trigger(["ipAddress", "snmpCommunity", "sshUsername"]);
    if (!isValid) return;

    setIsTesting(true);
    setAllTestsCompleted(false);
    setTestResult(null);
    setSnmpTestResult(null);
    setSshTestResult(null);

    try {
      const vals = form.getValues();

      // Test 1: Connectivity
      let connResult: 'success' | 'failure' = 'failure';
      try {
        const res = await testConnectivity({ ip_address: vals.ipAddress });
        connResult = res.any ? 'success' : 'failure';
      } catch (e) {
        connResult = 'failure';
      }
      setTestResult(connResult);

      // Test 2: SNMP
      let snmpResult: 'success' | 'failure' = 'failure';
      try {
        const res = await testSNMP({ ip_address: vals.ipAddress, community: vals.snmpCommunity });
        snmpResult = res.reachable ? 'success' : 'failure';
      } catch (e) {
        snmpResult = 'failure';
      }
      setSnmpTestResult(snmpResult);

      // Test 3: SSH
      let sshResult: 'success' | 'failure' = 'failure';
      try {
        const res = await testSSH({ ip_address: vals.ipAddress, port: 22 });
        sshResult = res.reachable ? 'success' : 'failure';
      } catch (e) {
        sshResult = 'failure';
      }
      setSshTestResult(sshResult);

      setAllTestsCompleted(true);
    } catch (err) {
      console.error('Test error:', err);
      setAllTestsCompleted(true);
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = (values: z.infer<typeof deviceSchema>) => {
    // Determine overall status based on connectivity test
    let overallStatus: 'online' | 'offline' | 'unknown' = 'unknown';
    if (testResult === 'success') {
      overallStatus = 'online';
    } else if (testResult === 'failure') {
      overallStatus = 'offline';
    }

    const payload: any = {
      hostname: values.hostname,
      ip_address: values.ipAddress,
      site_id: Number(values.siteId),
      device_type: values.deviceType,
      snmp_version: values.snmpVersion,
      snmp_community: values.snmpCommunity,
      ssh_username: values.sshUsername,
      ssh_password: values.sshPassword,
      ssh_enabled: !!values.sshUsername,
      status: overallStatus,
    };

    onAdd(payload as any);
    setOpen(false);
    form.reset();
    setTestResult(null);
    setSnmpTestResult(null);
    setSshTestResult(null);
    setAllTestsCompleted(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
          <DialogDescription>
            Enter device details. The system will attempt to auto-classify the device via SNMP.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="snmp">SNMP</TabsTrigger>
                <TabsTrigger value="ssh">SSH</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="hostname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hostname</FormLabel>
                      <FormControl>
                        <Input placeholder="CORE-RTR-01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ipAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IP Address</FormLabel>
                      <FormControl>
                        <Input placeholder="192.168.1.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Router">Router</SelectItem>
                          <SelectItem value="Switch">Switch</SelectItem>
                          <SelectItem value="Firewall">Firewall</SelectItem>
                          <SelectItem value="Voice-Gateway">Voice-Gateway</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="siteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select site" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sites.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.siteName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="snmp" className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="snmpVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SNMP Version</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select version" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="v2c">v2c</SelectItem>
                          <SelectItem value="v3">v3</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="snmpCommunity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Community String</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="public" {...field} />
                      </FormControl>
                      <FormDescription>For v2c only.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={runAllTests} disabled={isTesting}>
                    {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Test SNMP
                  </Button>
                  {snmpTestResult === 'success' && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> SNMP OK
                    </span>
                  )}
                  {snmpTestResult === 'failure' && (
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <XCircle className="h-4 w-4" /> SNMP Failed
                    </span>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ssh" className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="sshUsername"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sshPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="********" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={runAllTests} disabled={isTesting}>
                    {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Test SSH
                  </Button>
                  {sshTestResult === 'success' && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" /> SSH Port Open
                    </span>
                  )}
                  {sshTestResult === 'failure' && (
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <XCircle className="h-4 w-4" /> SSH Port Closed
                    </span>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-4 bg-muted/50 p-4 rounded-lg">
              <div>
                <p className="text-sm font-semibold mb-3">Auto-Test All Connectivity</p>
                <Button 
                  type="button" 
                  variant="default" 
                  size="sm" 
                  onClick={runAllTests} 
                  disabled={isTesting}
                  className="w-full"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Tests...
                    </>
                  ) : (
                    "Run All Tests"
                  )}
                </Button>
              </div>

              {allTestsCompleted && (
                <div className="space-y-2 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Connectivity:</span>
                    {testResult === 'success' && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Reachable
                      </span>
                    )}
                    {testResult === 'failure' && (
                      <span className="text-sm text-red-600 flex items-center gap-1">
                        <XCircle className="h-4 w-4" /> Unreachable
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">SNMP:</span>
                    {snmpTestResult === 'success' && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> OK
                      </span>
                    )}
                    {snmpTestResult === 'failure' && (
                      <span className="text-sm text-red-600 flex items-center gap-1">
                        <XCircle className="h-4 w-4" /> Failed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">SSH:</span>
                    {sshTestResult === 'success' && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Open
                      </span>
                    )}
                    {sshTestResult === 'failure' && (
                      <span className="text-sm text-red-600 flex items-center gap-1">
                        <XCircle className="h-4 w-4" /> Closed
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!allTestsCompleted}>
                {!allTestsCompleted ? "Run Tests First" : "Add Device"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
