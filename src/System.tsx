import { useEffect, useState } from 'react';

type ApiState = {
  loading: boolean;
  data: any;
  error: string;
};

const sections = [
  ['Overview', 'overview'],
  ['Market', 'market'],
  ['Behavior', 'behavior'],
  ['Customers', 'customers'],
  ['Products', 'products'],
  ['Sales', 'sales'],
  ['AI Team', 'ai'],
  ['Content', 'content'],
  ['Automation', 'automation'],
  ['Settings', 'settings'],
];

const endpoints: Record<string, string> = {
  market: '/api/market',
  behavior: '/api/behavior',
  customers: '/api/customers',
  products: '/api/products',
  sales: '/api/orders',
  ai: '/api/ai-runs',
  content: '/api/content',
  automation: '/api/workflows',
};

async function load(endpoint?: string): Promise<ApiState> {
  if (!endpoint) return { loading: false, data: null, error: '' };
  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return { loading: false, data, error: '' };
  } catch (error) {
    return { loading: false, data: null, error: error instanceof Error ? error.message : 'Request failed' };
  }
}

function countValue(data: any): number | string {
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.results)) return data.results.length;
  if (Array.isArray(data?.customers)) return data.customers.length;
  if (Array.isArray(data?.orders)) return data.orders.length;
  if (Array.isArray(data?.products)) return data.products.length;
  return data ? 'READY' : '—';
}

export default function System() {
  const [active, setActive] = useState('overview');
  const [state, setState] = useState<ApiState>({ loading: false, data: null, error: '' });
  const [overview, setOverview] = useState<Record<string, ApiState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys = ['customers', 'products', 'sales', 'behavior', 'market', 'ai', 'automation'];
      const entries = await Promise.all(keys.map(async key => [key, await load(endpoints[key])] as const));
      if (!cancelled) setOverview(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (active === 'overview') {
      setState({ loading: false, data: null, error: '' });
      return;
    }
    setState({ loading: true, data: null, error: '' });
    let cancelled = false;
    load(endpoints[active]).then(result => { if (!cancelled) setState(result); });
    return () => { cancelled = true; };
  }, [active]);

  const isOverview = active === 'overview';
  const data = isOverview ? overview : state;

  return (
    <div className="min-h-screen bg-[#0c0d0d] text-[#ece8e5]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-white/10 bg-[#101111] lg:block">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#ff5e1a] font-black text-black">T</div>
          <div>
            <div className="text-sm font-bold tracking-[0.18em]">TATO-OS</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Coffee Intelligence</div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {sections.map(([label, key]) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${active === key ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/45">
          <div className="mb-1 text-white/70">System</div>
          Customer site: <span className="text-white/70">/</span><br />
          HQ system: <span className="text-[#ff8a5c]">/system</span>
        </div>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-white/10 bg-[#0c0d0d]/90 px-5 backdrop-blur-xl lg:px-8">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/35">TATO HQ</div>
            <h1 className="mt-1 text-xl font-semibold">{sections.find(([, key]) => key === active)?.[0]}</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> D1 Connected
          </div>
        </header>

        <div className="p-5 lg:p-8">
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">Command Center</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">Business · Market · Behavior · AI</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
              ระบบหลังบ้านแยกจาก Customer Website อย่างชัดเจน
            </p>
          </div>

          {isOverview ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Customers', 'customers'],
                ['Products', 'products'],
                ['Orders', 'sales'],
                ['Behavior Events', 'behavior'],
                ['Market Signals', 'market'],
                ['AI Runs', 'ai'],
                ['Workflows', 'automation'],
              ].map(([label, key]) => (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-white/20 hover:bg-white/[0.045]"
                >
                  <div className="text-sm text-white/45">{label}</div>
                  <div className="mt-4 text-3xl font-semibold">{overview[key]?.loading ? '…' : countValue(overview[key]?.data)}</div>
                  {overview[key]?.error && <div className="mt-2 text-xs text-red-300">{overview[key].error}</div>}
                </button>
              ))}
            </div>
          ) : (
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/45">Live API</div>
                  <div className="mt-1 font-mono text-xs text-[#ff8a5c]">{endpoints[active]}</div>
                </div>
                {state.loading && <div className="text-xs text-white/35">Loading…</div>}
              </div>
              {state.error ? (
                <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{state.error}</div>
              ) : (
                <pre className="max-h-[60vh] overflow-auto rounded-xl bg-black/30 p-4 text-xs leading-6 text-white/65">
                  {state.loading ? 'Loading…' : JSON.stringify(state.data, null, 2)}
                </pre>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
