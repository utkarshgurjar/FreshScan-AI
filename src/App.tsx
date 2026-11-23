import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Camera,
  Code2,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Shield,
  User,
  X,
} from 'lucide-react';
import type {
  BatchSummary,
  DashboardSummary,
  ProduceTypeRecord,
  ScanRecord,
  UserProfile,
} from './types/freshscan';
import { ScannerView } from './components/ScannerView';
import { DashboardView } from './components/DashboardView';
import { BatchesView } from './components/BatchesView';
import { SensorsView } from './components/SensorsView';
import { AdminView } from './components/AdminView';
import { BlueprintView } from './components/BlueprintView';
import { AuthModal } from './components/AuthModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';

type NavSection = 'scanner' | 'dashboard' | 'batches' | 'sensors' | 'admin' | 'blueprint';

const NAV_ITEMS: Array<{ id: NavSection; label: string; breadcrumb: string; icon: typeof Camera }> = [
  { id: 'scanner', label: 'Live Scanner', breadcrumb: 'Quality Lab / Optical Scanner', icon: Camera },
  { id: 'dashboard', label: 'Analytics', breadcrumb: 'Quality Lab / Dashboard', icon: BarChart3 },
  { id: 'batches', label: 'Batches & History', breadcrumb: 'Inventory / Lots & Scans', icon: Package },
  { id: 'sensors', label: 'Thermal & Gas IoT', breadcrumb: 'Cold Chain / IoT Telemetry', icon: Activity },
  { id: 'admin', label: 'Admin & Dataset', breadcrumb: 'Governance / Admin Console', icon: Shield },
  { id: 'blueprint', label: 'Spring Boot Code', breadcrumb: 'Architecture / Java 21 Blueprint', icon: Code2 },
];

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('scanner');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // In-memory JWT Bearer session (never persisted to localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [produceTypes, setProduceTypes] = useState<ProduceTypeRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAll = useCallback(async () => {
    try {
      const [bRes, sRes, pRes, dRes] = await Promise.all([
        fetch('/api/batches'),
        fetch('/api/scans'),
        fetch('/api/produce-types'),
        fetch('/api/dashboard/summary'),
      ]);
      if (bRes.ok) setBatches(await bRes.json());
      if (sRes.ok) setScans(await sRes.json());
      if (pRes.ok) setProduceTypes(await pRes.json());
      if (dRes.ok) setDashboard(await dRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleAuthenticated = (payload: {
    accessToken: string;
    refreshToken: string;
    user: UserProfile;
  }) => {
    setAuthToken(payload.accessToken);
    setRefreshToken(payload.refreshToken);
    setCurrentUser(payload.user);
  };

  useEffect(() => {
    if (!refreshToken) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) setAuthToken(data.accessToken);
          if (data.user) setCurrentUser(data.user);
        }
      } catch {
        // Keep current session until next retry
      }
    }, 1000 * 60 * 30);
    return () => window.clearInterval(timer);
  }, [refreshToken]);

  const handleSignOut = () => {
    setAuthToken(null);
    setRefreshToken(null);
    setCurrentUser(null);
  };

  const handleScanCreated = (scan: ScanRecord) => {
    setScans((prev) => [scan, ...prev]);
    refreshAll();
  };

  const activeMeta = NAV_ITEMS.find((n) => n.id === activeNav) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <span className="text-lg font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap">
            FreshScan AI
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2.5">
          <PWAInstallButton variant="full" />
          {currentUser ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.name}
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">
                  {currentUser.role} · {currentUser.email}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-2 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
            >
              <User className="w-3.5 h-3.5" />
              Sign In / Admin Access
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
              <span className="text-base font-extrabold text-slate-900 font-display">
                FreshScan AI
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-emerald-50 text-emerald-900 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Contextual Top Header (Compact 56px on mobile, 64px on desktop) */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 pt-safe bg-white/95 backdrop-blur-md border-b border-slate-200 px-3.5 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="lg:hidden text-base font-extrabold tracking-tight text-slate-900 font-display whitespace-nowrap">
              FreshScan AI
            </span>
            <span className="hidden lg:inline text-sm font-medium text-slate-600 truncate">
              {activeMeta.breadcrumb}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton variant="compact" />
            {currentUser ? (
              <span className="hidden sm:inline text-xs text-slate-600 whitespace-nowrap">
                {currentUser.name} · <strong className="font-semibold text-slate-900">{currentUser.role}</strong>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                Sign In
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveNav('scanner')}
              className="hidden lg:inline-flex px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              New Scan
            </button>
          </div>
        </header>

        {/* Active Workspace Viewport (extra bottom padding on mobile for fixed thumb nav) */}
        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8 max-w-[1360px] w-full mx-auto">
          {activeNav === 'scanner' && (
            <ScannerView
              batches={batches}
              produceTypes={produceTypes}
              authToken={authToken}
              onScanCreated={handleScanCreated}
            />
          )}
          {activeNav === 'dashboard' && (
            <DashboardView
              summary={dashboard}
              batches={batches}
              loading={loading}
              onNavigateScanner={() => setActiveNav('scanner')}
            />
          )}
          {activeNav === 'batches' && (
            <BatchesView
              batches={batches}
              scans={scans}
              authToken={authToken}
              currentUser={currentUser}
              onRefresh={refreshAll}
            />
          )}
          {activeNav === 'sensors' && (
            <SensorsView batches={batches} onAlertsChanged={refreshAll} />
          )}
          {activeNav === 'admin' && (
            <AdminView
              authToken={authToken}
              currentUser={currentUser}
              onAuthenticated={handleAuthenticated}
              onConfigUpdated={refreshAll}
            />
          )}
          {activeNav === 'blueprint' && <BlueprintView />}
        </main>
      </div>

      {/* Fixed Mobile Bottom Tab Bar (Thumb-Zone Navigation, >=44px targets) */}
      <nav
        aria-label="Mobile primary navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {(
            [
              { id: 'scanner', label: 'Scan', icon: Camera },
              { id: 'dashboard', label: 'Analytics', icon: BarChart3 },
              { id: 'batches', label: 'Batches', icon: Package },
              { id: 'sensors', label: 'Sensors', icon: Activity },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeNav === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveNav(tab.id);
                  setMobileMoreOpen(false);
                }}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
                <span className={`text-[10px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              activeNav === 'admin' || activeNav === 'blueprint' || mobileMoreOpen
                ? 'text-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Bottom Sheet */}
      {mobileMoreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-end"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl border-t border-slate-200 p-5 pb-safe space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Tools &amp; Account</h2>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close sheet"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveNav('admin');
                  setMobileMoreOpen(false);
                }}
                className={`w-full min-h-[48px] flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl ${
                  activeNav === 'admin'
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Shield className="w-5 h-5 text-emerald-700" />
                <span>Admin &amp; Retraining Dataset</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveNav('blueprint');
                  setMobileMoreOpen(false);
                }}
                className={`w-full min-h-[48px] flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl ${
                  activeNav === 'blueprint'
                    ? 'bg-emerald-50 text-emerald-900 font-semibold'
                    : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Code2 className="w-5 h-5 text-slate-600" />
                <span>Java Spring Boot 3.x Code</span>
              </button>
            </div>

            <PWAInstallButton variant="full" />

            <div className="pt-2 border-t border-slate-100">
              {currentUser ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-xs font-mono text-slate-500 truncate">
                      {currentUser.role} · {currentUser.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleSignOut();
                      setMobileMoreOpen(false);
                    }}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-xl inline-flex items-center gap-1.5 shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    setAuthModalOpen(true);
                  }}
                  className="w-full min-h-[48px] px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center justify-center gap-2"
                >
                  <User className="w-4 h-4" />
                  Sign In / Admin Access
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  );
}
