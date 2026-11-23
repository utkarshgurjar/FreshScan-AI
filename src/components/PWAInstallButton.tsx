import { useState } from 'react';
import { Check, Copy, Download, Share2, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export function PWAInstallButton({ variant = 'compact' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors in restricted frames
    }
  };

  return (
    <>
      {variant === 'full' ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
        >
          {isInstallable ? <Download className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
          {isInstallable ? 'Install FreshScan App' : isIOS ? 'Add to iPhone Home Screen' : 'Use on Mobile / Install App'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          {isInstallable ? <Download className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
          <span>{isInstallable ? 'Install App' : 'Mobile App'}</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white border-t sm:border border-slate-200 rounded-t-3xl sm:rounded-2xl p-6 pb-safe space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-2 mb-1 sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install FreshScan AI on Phone'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Run fullscreen like a native mobile scanner with one-tap rear camera capture.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
                <li>
                  Open this URL in <strong>Safari</strong> on your iPhone or iPad.
                </li>
                <li>
                  Tap the <Share2 className="w-3.5 h-3.5 inline mx-0.5 text-slate-900" />{' '}
                  <strong>Share</strong> button in the bottom toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then tap{' '}
                  <strong>Add</strong>.
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-sm text-slate-700">
                <div>
                  <div className="font-semibold text-slate-900">Android (Chrome / Edge)</div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Open the app link in Chrome on your phone, tap the menu (⋮), and choose{' '}
                    <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </p>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">iPhone / iPad (Safari)</div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Open the link in Safari, tap <strong>Share</strong>, and choose{' '}
                    <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex-1 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors inline-flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'App URL Copied' : 'Copy Mobile App Link'}
              </button>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
