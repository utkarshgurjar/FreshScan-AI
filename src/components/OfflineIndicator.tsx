import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 lg:bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2.5 text-xs font-medium text-white shadow-md"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Offline Mode — Showing cached interface. Reconnect to run AI scans.</span>
    </div>
  );
}
