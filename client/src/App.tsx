import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/store";
import { fetchDevices } from "@/features/devices/devicesSlice";
import { Switch, Route } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/pages/Dashboard";
import Devices from "@/pages/Devices";
import DeviceDetail from "@/pages/DeviceDetail";
import Topology from "@/pages/Topology";
import Alerts from "@/pages/Alerts";
import Syslog from "@/pages/Syslog";
import NetFlow from "@/pages/NetFlow";
import Sites from "@/pages/Sites";
import SiteDetail from "@/pages/SiteDetail";
import NotFound from "@/pages/not-found";
import MacAlarms from "@/pages/MacAlarms";
import DevicesTest from "@/pages/DevicesTest";
import useIncrementalSync from "@/hooks/useIncrementalSync";

function Router() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devices" component={Devices} />
        <Route path="/devices/:id" component={DeviceDetail} />
        <Route path="/topology" component={Topology} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/syslog" component={Syslog} />
        <Route path="/netflow" component={NetFlow} />
        <Route path="/sites/:id" component={SiteDetail} />
        <Route path="/sites" component={Sites} />

        {/* ✅ FIX: Add MAC alarms BEFORE NotFound */}
        <Route path="/mac-alarms" component={MacAlarms} />
        <Route path="/devicestest" component={DevicesTest} />

        {/* ⛔ Catch-all must be last */}
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function AppContent() {
  // Initialize incremental sync polling globally (30-second poll interval)
  useIncrementalSync(30000);
  
  return <Router />;
}

function App() {
  const dispatch = useDispatch<AppDispatch>();
  
  // Fetch initial complete device list on app start
  useEffect(() => {
    dispatch(fetchDevices());
  }, [dispatch]);

  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
