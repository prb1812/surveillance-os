'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '@/lib/api';

export default function AnalyticsPage() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>('/cameras').then(setCameras);
    api.get<any[]>('/alerts').then(setAlerts);
  }, []);

  const online = cameras.filter((c) => c.status === 'ONLINE').length;
  const offline = cameras.filter((c) => c.status === 'OFFLINE').length;

  const alertsByType = alerts.reduce((acc: Record<string, number>, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(alertsByType).map(([type, count]) => ({ type, count }));

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Cameras', value: cameras.length, color: 'bg-blue-600' },
          { label: 'Online', value: online, color: 'bg-green-600' },
          { label: 'Offline', value: offline, color: 'bg-red-500' },
          { label: 'Total Alerts', value: alerts.length, color: 'bg-yellow-500' },
        ].map((s) => (
          <div key={s.label} className={`${s.color} text-white rounded-xl p-4`}>
            <p className="text-sm opacity-80">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="font-semibold mb-4">Alerts by Type</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="type" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
