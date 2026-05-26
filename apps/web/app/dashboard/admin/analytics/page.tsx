'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';


export default function AnalyticsPage() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>('/cameras').then(setCameras);
    api.get<any[]>('/alerts').then(setAlerts);
  }, []);

  const online = cameras.filter(c => c.status === 'ONLINE').length;
  const offline = cameras.filter(c => c.status === 'OFFLINE').length;
  const alertsByType = alerts.reduce((acc: Record<string, number>, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});
  const chartData = Object.entries(alertsByType).map(([type, count]) => ({ type, count }));

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Cameras', value: cameras.length, color: 'bg-cyan-500/20 text-cyan-400' },
          { label: 'Online', value: online, color: 'bg-green-500/20 text-green-400' },
          { label: 'Offline', value: offline, color: 'bg-red-500/20 text-red-400' },
          { label: 'Total Alerts', value: alerts.length, color: 'bg-yellow-500/20 text-yellow-400' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl p-4 border border-gray-800`}>
            <p className="text-sm opacity-70">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Alerts by Type</h2>
        {chartData.length === 0 ? <p className="text-gray-500">No alert data yet.</p> : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="type" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
              <Bar dataKey="count" fill="#22d3ee" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </DashboardLayout>
  );
}
