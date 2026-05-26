'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';


interface Alert { id: string; type: string; status: string; message: string; createdAt: string; camera?: { name: string }; }

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const load = async () => { setLoading(true); const d = await api.get<Alert[]>('/alerts'); setAlerts(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const acknowledge = async (id: string) => { await api.patch(`/alerts/${id}/acknowledge`, {}); load(); };
  const resolve = async (id: string) => { await api.patch(`/alerts/${id}/resolve`, {}); load(); };

  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.status === filter);

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <div className="flex gap-2">
          {['ALL', 'PENDING', 'ACKNOWLEDGED', 'RESOLVED'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded text-sm border ${filter === s ? 'bg-cyan-400 text-gray-950 border-cyan-400 font-semibold' : 'border-gray-700 text-gray-400'}`}>{s}</button>
          ))}
        </div>
      </div>
      {loading ? <p className="text-gray-400">Loading...</p> : (
        <div className="space-y-3">
          {filtered.length === 0 && <p className="text-gray-500">No alerts.</p>}
          {filtered.map(a => (
            <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{a.type} {a.camera && <span className="text-gray-400 text-sm">— {a.camera.name}</span>}</p>
                <p className="text-gray-400 text-sm mt-1">{a.message}</p>
                <p className="text-gray-600 text-xs mt-1">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`px-2 py-1 rounded text-xs font-bold ${a.status === 'RESOLVED' ? 'bg-green-500/20 text-green-400' : a.status === 'ACKNOWLEDGED' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{a.status}</span>
                {a.status === 'PENDING' && <button onClick={() => acknowledge(a.id)} className="text-yellow-400 text-sm hover:underline">Acknowledge</button>}
                {a.status !== 'RESOLVED' && <button onClick={() => resolve(a.id)} className="text-green-400 text-sm hover:underline">Resolve</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
