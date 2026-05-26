'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Alert {
  id: string;
  type: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string;
  createdAt: string;
  camera?: { name: string };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const load = async () => {
    setLoading(true);
    const data = await api.get<Alert[]>('/alerts');
    setAlerts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const acknowledge = async (id: string) => { await api.patch(`/alerts/${id}/acknowledge`, {}); load(); };
  const resolve = async (id: string) => { await api.patch(`/alerts/${id}/resolve`, {}); load(); };

  const filtered = filter === 'ALL' ? alerts : alerts.filter((a) => a.status === filter);

  const statusColor = (s: string) =>
    s === 'RESOLVED' ? 'bg-green-100 text-green-700' :
    s === 'ACKNOWLEDGED' ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-700';

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <div className="flex gap-2">
          {['ALL', 'PENDING', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded text-sm border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>{s}</button>
          ))}
        </div>
      </div>
      {loading ? <p>Loading...</p> : (
        <div className="space-y-3">
          {filtered.length === 0 && <p className="text-gray-500">No alerts.</p>}
          {filtered.map((a) => (
            <div key={a.id} className="bg-white rounded shadow p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{a.type} {a.camera && <span className="text-sm text-gray-500">— {a.camera.name}</span>}</p>
                <p className="text-sm text-gray-600 mt-1">{a.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 rounded text-xs font-bold ${statusColor(a.status)}`}>{a.status}</span>
                {a.status === 'PENDING' && <button onClick={() => acknowledge(a.id)} className="text-yellow-600 text-sm hover:underline">Acknowledge</button>}
                {a.status !== 'RESOLVED' && <button onClick={() => resolve(a.id)} className="text-green-600 text-sm hover:underline">Resolve</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
