import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { UserProfile, UserRole } from '../types/freshscan';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (payload: {
    accessToken: string;
    refreshToken: string;
    user: UserProfile;
  }) => void;
}

export function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'admin'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('inspector@freshscan.local');
  const [password, setPassword] = useState('inspector-preview');
  const [role, setRole] = useState<UserRole>('INSPECTOR');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminStatus, setAdminStatus] = useState<{
    envConfigured: boolean;
    claimed: boolean;
    adminConfigured: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/auth/admin-status')
      .then((r) => r.json())
      .then(setAdminStatus)
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let url = '/api/auth/login';
      let body: Record<string, unknown> = { email, password };

      if (mode === 'register') {
        url = '/api/auth/register';
        body = { name, email, password, role };
      } else if (mode === 'admin') {
        url = '/api/auth/claim-admin';
        body = { passcode: adminPasscode, email: email || 'admin@freshscan.local', name: name || 'Lead QA Administrator' };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Authentication failed.');
        return;
      }
      onAuthenticated(data);
      onClose();
    } catch {
      setError('Unable to reach authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white border-t sm:border border-slate-200 rounded-t-3xl sm:rounded-xl shadow-lg p-5 sm:p-6 pb-safe space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">FreshScan AI Account</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              JWT Bearer session stored strictly in memory for role-based inspection controls.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'login', label: 'Sign In' },
            { id: 'register', label: 'Register' },
            { id: 'admin', label: 'Admin Access' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setError(null);
                setMode(tab.id as 'login' | 'register' | 'admin');
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'admin' && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                {adminStatus?.adminConfigured
                  ? 'Administrator Sign-In'
                  : 'First-Run Administrator Setup'}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {adminStatus?.envConfigured
                  ? 'Enter the configured ADMIN_PASSCODE secret to sign in with full Admin permissions.'
                  : adminStatus?.claimed
                    ? 'Enter the administrator password you established during first-run setup.'
                    : 'Choose an administrator password (min. 6 characters) to initialize Admin access for this session.'}
              </p>
            </div>
          )}

          {(mode === 'register' || mode === 'admin') && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Full Name</span>
              <input
                type="text"
                required={mode === 'register'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={mode === 'admin' ? 'Lead QA Administrator' : 'Jordan Patel'}
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Email Address</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="inspector@freshscan.local"
              className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
            />
          </label>

          {mode !== 'admin' ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">
                {adminStatus?.adminConfigured ? 'Admin Password / Passcode' : 'Create Admin Password'}
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </label>
          )}

          {mode === 'register' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="INSPECTOR">Inspector (Scan, Batches, Reports)</option>
                <option value="USER">User (Scan &amp; Own History)</option>
              </select>
            </label>
          )}

          {mode === 'login' && (
            <p className="text-[11px] text-slate-500">
              Demo Inspector prefilled: <span className="font-mono">inspector@freshscan.local</span>
            </p>
          )}

          {error && (
            <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors"
          >
            {loading
              ? 'Authenticating...'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                  ? 'Create Account'
                  : adminStatus?.adminConfigured
                    ? 'Sign In as Admin'
                    : 'Claim Admin Access'}
          </button>
        </form>
      </div>
    </div>
  );
}
