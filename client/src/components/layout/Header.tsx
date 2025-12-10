import { Search, Bell, HelpCircle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { useLocation } from 'wouter';
import { setSearch } from '@/features/devices/devicesSlice';
import { useRef, useEffect } from 'react';

export function Header() {
  const dispatch = useDispatch<AppDispatch>();
  const search = useSelector((state: RootState) => state.devices.search);
  const unreadAlerts = useSelector((state: RootState) => state.alerts.unreadCount);
  const [location] = useLocation();
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Hide search bar on Device Detail page
  const isDeviceDetailPage = /^\/devices\/\d+$/.test(location);

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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur-md">
      <div className="flex flex-1 items-center gap-4">
        {!isDeviceDetailPage && (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search devices, IP, MAC..."
              defaultValue={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-muted/50 pl-9 md:w-2/3 lg:w-full border-transparent focus-visible:bg-background focus-visible:border-primary focus-visible:ring-0"
            />
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          {unreadAlerts > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
