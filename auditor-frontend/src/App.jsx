import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  ScanLine, UploadCloud, Wifi, WifiOff, Store, CalendarDays, Wallet, Percent,
  Loader2, X, Search, ArrowUpDown, Download, Copy, Check, AlertTriangle,
  CheckCircle2, ImageIcon, RotateCcw, Sparkles,
} from 'lucide-react';

const API_BASE = 'http://localhost:5000';
const MAX_MB = 10;
const CURRENCIES = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };

/* ---------- helpers ---------- */
const money = (n, cur) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(Number(n) || 0);

function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const end = Number(target) || 0;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      setVal(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ---------- small components ---------- */
function StatusBadge({ status }) {
  const map = {
    online: { text: 'API Online', sub: 'Backend connected', dot: 'bg-emerald-400', ring: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', Icon: Wifi },
    offline: { text: 'API Offline', sub: 'Backend unreachable', dot: 'bg-rose-400', ring: 'border-rose-500/30 bg-rose-500/10 text-rose-300', Icon: WifiOff },
    checking: { text: 'Checking…', sub: 'Contacting backend', dot: 'bg-amber-400', ring: 'border-amber-500/30 bg-amber-500/10 text-amber-300', Icon: Loader2 },
  }[status];
  const { Icon } = map;
  return (
    <div title={map.sub} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${map.ring}`}>
      <span className="relative flex h-2 w-2">
        {status === 'online' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${map.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${map.dot}`} />
      </span>
      <Icon className={`h-4 w-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{map.text}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, children, accent }) {
  return (
    <div className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20 transition hover:border-indigo-500/40">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-slate-400">{label}</p>
      <div className="mt-1 truncate text-2xl font-semibold text-slate-50">{children}</div>
    </div>
  );
}

/* ---------- main app ---------- */
export default function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [apiStatus, setApiStatus] = useState('checking');
  const [currency, setCurrency] = useState('USD');
  const [query, setQuery] = useState('');
  const [sortDir, setSortDir] = useState(null); // null | 'asc' | 'desc'
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  /* backend health: any HTTP response means the server is reachable */
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        await axios.get(API_BASE, { timeout: 4000, validateStatus: () => true });
        if (alive) setApiStatus('online');
      } catch {
        if (alive) setApiStatus('offline');
      }
    };
    ping();
    const id = setInterval(ping, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  /* free object URLs */
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const acceptFile = useCallback((f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Unsupported file. Upload a JPG, PNG or WebP image.');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`Image is larger than ${MAX_MB} MB. Upload a smaller photo.`);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError('');
    setQuery('');
    setSortDir(null);
  }, []);

  /* allow pasting a screenshot straight from the clipboard */
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) acceptFile(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptFile]);

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleAudit = async () => {
    if (!file) return setError('Select a receipt image first.');
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('receipt', file);
    try {
      const res = await axios.post(`${API_BASE}/api/audit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setResult(res.data.data);
        setApiStatus('online');
        setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setError('The audit ran but the response could not be read. Try a clearer photo.');
      }
    } catch (err) {
      if (!err.response) setApiStatus('offline');
      setError(err.response?.data?.error || 'Cannot reach the server. Start the backend on port 5000 and try again.');
    } finally {
      setLoading(false);
    }
  };

  /* derived data */
  const items = result?.items ?? [];
  const visibleItems = useMemo(() => {
    let list = items.filter((i) => (i.name || '').toLowerCase().includes(query.toLowerCase()));
    if (sortDir) list = [...list].sort((a, b) => (sortDir === 'asc' ? a.price - b.price : b.price - a.price));
    return list;
  }, [items, query, sortDir]);

  const itemsSum = items.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const expectedTotal = itemsSum + (Number(result?.tax) || 0);
  const diff = result ? Math.abs(expectedTotal - (Number(result.totalAmount) || 0)) : 0;
  const matches = diff < 0.02;

  const animTotal = useCountUp(result?.totalAmount);
  const animTax = useCountUp(result?.tax);

  const exportCsv = () => {
    const rows = [['Item Name', 'Price'], ...items.map((i) => [`"${(i.name || '').replace(/"/g, '""')}"`, i.price])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(result.vendor || 'receipt').replace(/\s+/g, '-').toLowerCase()}-audit.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 antialiased selection:bg-indigo-500/30">
      {/* background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[360px] w-[360px] rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      {/* nav */}
      <nav className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/40">
              <ScanLine className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              InvoiceAudit <span className="text-violet-400">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-indigo-500"
            >
              {Object.entries(CURRENCIES).map(([code, sym]) => (
                <option key={code} value={code}>{sym} {code}</option>
              ))}
            </select>
            <StatusBadge status={apiStatus} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* hero + upload */}
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Turn any receipt into an audited record
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Upload a photo of a receipt or invoice. We extract the vendor, date, tax and every line item, then check that the numbers add up.
          </p>
        </section>

        <section className="mx-auto mt-10 max-w-3xl">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files[0]); }}
            onClick={() => !preview && inputRef.current?.click()}
            onKeyDown={(e) => !preview && (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload receipt image"
            className={`relative rounded-3xl border-2 border-dashed p-6 transition-all sm:p-10 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              dragging
                ? 'scale-[1.01] border-indigo-400 bg-indigo-500/10'
                : 'border-slate-700 bg-slate-900/50 hover:border-indigo-500/60'
            } ${preview ? '' : 'cursor-pointer'}`}
          >
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => acceptFile(e.target.files[0])} />

            {!preview ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 transition ${dragging ? 'scale-110' : ''}`}>
                  <UploadCloud className="h-8 w-8" />
                </div>
                <p className="text-lg font-medium text-slate-100">
                  {dragging ? 'Drop to upload' : 'Drag a receipt here, or click to browse'}
                </p>
                <p className="text-sm text-slate-500">JPG, PNG or WebP up to {MAX_MB} MB. You can also paste a screenshot.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                  <img src={preview} alt="Receipt preview" className="max-h-72 w-full max-w-xs object-contain" />
                  {loading && (
                    <div className="absolute inset-0 overflow-hidden bg-indigo-950/40">
                      <div className="absolute inset-x-0 h-12 animate-[scan_1.8s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-violet-400/50 to-transparent" />
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium text-slate-100">
                        <ImageIcon className="h-4 w-4 shrink-0 text-indigo-400" /> <span className="truncate">{file?.name}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{(file?.size / 1024).toFixed(0)} KB, ready to audit</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); reset(); }}
                      disabled={loading}
                      aria-label="Remove image"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                    disabled={loading}
                    className="mt-4 text-sm text-indigo-400 transition hover:text-indigo-300 disabled:opacity-40"
                  >
                    Choose a different image
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={handleAudit}
            disabled={loading || !file}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Auditing receipt…</>
            ) : (
              <><Sparkles className="h-5 w-5" /> Run Snapshot Audit</>
            )}
          </button>
        </section>

        {/* results */}
        {result && (
          <section id="results" className="mt-14 scroll-mt-24">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-white">Audit report</h2>
              <div className="flex gap-2">
                <button onClick={copyJson} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-indigo-500/50 hover:text-white">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy JSON'}
                </button>
                <button onClick={exportCsv} disabled={!items.length} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-indigo-500/50 hover:text-white disabled:opacity-40">
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                <button onClick={reset} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-indigo-500/50 hover:text-white">
                  <RotateCcw className="h-4 w-4" /> New audit
                </button>
              </div>
            </div>

            {/* summary cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={Store} label="Vendor" accent="bg-indigo-500/15 text-indigo-300">
                <span title={result.vendor}>{result.vendor || 'N/A'}</span>
              </StatCard>
              <StatCard icon={CalendarDays} label="Date" accent="bg-violet-500/15 text-violet-300">
                {result.date || 'N/A'}
              </StatCard>
              <StatCard icon={Wallet} label="Total amount" accent="bg-emerald-500/15 text-emerald-300">
                {money(animTotal, currency)}
              </StatCard>
              <StatCard icon={Percent} label="Total tax" accent="bg-amber-500/15 text-amber-300">
                {money(animTax, currency)}
              </StatCard>
            </div>

            {/* integrity check */}
            <div className={`mt-4 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
              matches ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}>
              {matches ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
              <p>
                {matches
                  ? `Totals match. Items (${money(itemsSum, currency)}) plus tax (${money(result.tax, currency)}) equal the receipt total.`
                  : `Totals differ by ${money(diff, currency)}. Items plus tax come to ${money(expectedTotal, currency)}, but the receipt shows ${money(result.totalAmount, currency)}. Check for discounts, tips or missed items.`}
              </p>
            </div>

            {/* items table */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg shadow-black/20">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
                <h3 className="font-medium text-white">
                  Line items <span className="ml-1 text-sm text-slate-500">({visibleItems.length}{visibleItems.length !== items.length && ` of ${items.length}`})</span>
                </h3>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search items"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500 sm:w-56"
                  />
                </div>
              </div>

              {items.length === 0 ? (
                <p className="p-8 text-center text-slate-500">No line items were extracted. Try a sharper, well-lit photo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-5 py-3 font-medium">Item name</th>
                        <th className="px-5 py-3 text-right font-medium">
                          <button
                            onClick={() => setSortDir((d) => (d === null ? 'desc' : d === 'desc' ? 'asc' : null))}
                            className="inline-flex items-center gap-1.5 transition hover:text-white"
                          >
                            Price <ArrowUpDown className={`h-3.5 w-3.5 ${sortDir ? 'text-indigo-400' : ''}`} />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {visibleItems.map((item, idx) => (
                        <tr key={idx} className="transition hover:bg-indigo-500/5">
                          <td className="px-5 py-3.5 text-slate-200">{item.name}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-100">{money(item.price, currency)}</td>
                        </tr>
                      ))}
                      {visibleItems.length === 0 && (
                        <tr><td colSpan={2} className="px-5 py-8 text-center text-slate-500">No items match "{query}".</td></tr>
                      )}
                    </tbody>
                    <tfoot className="border-t border-slate-700 bg-slate-900/80 text-slate-300">
                      <tr><td className="px-5 py-3">Items subtotal</td><td className="px-5 py-3 text-right tabular-nums">{money(itemsSum, currency)}</td></tr>
                      <tr><td className="px-5 py-3">Tax</td><td className="px-5 py-3 text-right tabular-nums">{money(result.tax, currency)}</td></tr>
                      <tr className="font-semibold text-white"><td className="px-5 py-3">Total</td><td className="px-5 py-3 text-right tabular-nums">{money(result.totalAmount, currency)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="mt-16 text-center text-sm text-slate-600">
          InvoiceAudit AI checks extracted values against each other. Verify important figures against the original receipt.
        </footer>
      </main>

      {/* scan-line keyframes (kept inline so no tailwind.config change is needed) */}
      <style>{`@keyframes scan { 0% { top: -3rem } 50% { top: calc(100% - 0rem) } 100% { top: -3rem } }`}</style>
    </div>
  );
}