import { useEffect, useState, useRef } from "react";
import { useParams } from "wouter";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { setSearch } from "@/features/devices/devicesSlice";
import { getSites, getDevices } from "@/lib/api";
import { Site, Device } from "@/lib/types";
import { AddDeviceToSiteDialog } from "@/components/sites/AddDeviceToSiteDialog";
import { SiteDeviceGrid } from "@/components/sites/SiteDeviceGrid";

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const search = useSelector((state: RootState) => state.devices.search);
  
  const [site, setSite] = useState<Site | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const fetchData = async () => {
    try {
      setLoading(true);
      const siteId = Number(id);
      
      // Fetch site details
      const allSites = await getSites();
      const foundSite = allSites.find((s: Site) => s.id === siteId);
      setSite(foundSite || null);

      // Fetch all devices and filter by site_id
      const allDevices = await getDevices();
      const siteDevices = allDevices.filter((d: Device) => d.siteId === siteId);
      
      // Add siteName to each device
      const devicesWithSiteName = siteDevices.map((device: any) => ({
        ...device,
        siteName: foundSite?.siteName || null
      }));
      
      setDevices(devicesWithSiteName);
    } catch (err: any) {
      setError(err.message || "Failed to load site details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      dispatch(setSearch(value));
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleDevicesAdded = () => {
    fetchData();
  };

  // Filter devices based on search
  const filteredDevices = devices.filter((device) => {
    if (!search) return true;
    const hostname = device.hostname ?? "";
    const lldpHostname = device.lldpHostname ?? "";
    const ip = device.ipAddress ?? "";
    return (
      hostname.toLowerCase().includes(search.toLowerCase()) ||
      lldpHostname.toLowerCase().includes(search.toLowerCase()) ||
      ip.includes(search)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading site details</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  if (!site) {
    return <div className="text-center py-8">Site not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{site.siteName}</h1>
          <p className="text-muted-foreground">
            {site.location && `Location: ${site.location}`}
          </p>
          {site.description && (
            <p className="text-muted-foreground">{site.description}</p>
          )}
        </div>
        {site && (
          <AddDeviceToSiteDialog siteId={site.id} onDevicesAdded={handleDevicesAdded} />
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Total Devices: <span className="font-semibold">{devices.length}</span>
      </div>

      <SiteDeviceGrid devices={filteredDevices} search={search} onSearchChange={handleSearchChange} />
    </div>
  );
}
