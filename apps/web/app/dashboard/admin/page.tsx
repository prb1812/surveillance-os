'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ cameras: 0, onlineCameras: 0, alerts: 0, clients: 0, operators: 0 });
  const [cameras, setCameras] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'SUPER_ADMIN') { router.push('/login'); return; }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [c, a, cl, u] = await Promise.all([
        api.get<any[]>('/cameras'),
        api.get<any[]>('/alerts'),
        api.get<any[]>('/clients'),
        api.get<any[]>('/users'),
      ]);
      setCameras(c);
      setAlerts(a.slice(0, 5));
      setStats({
        cameras: c.length,
        onlineCameras: c.filter((x: any) => x.status === 'ONLINE').length,
        alerts: a.filter((x: any) => x.status === 'PENDING').length,
        clients: cl.length,
        operators: u.filter((x: any) => x.role === 'OPERATOR').length,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-cyan-400 text-xl animate-pulse">Loading...</div>
    </div>
  );

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">{new Date().toLocaleDateString()}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          { label: 'Total Cameras', value: stats.cameras, icon: '📷' },
          { label: 'Online Now',    value: stats.onlineCameras, icon: '🟢' },
          { label: 'Open Alerts',   value: stats.alerts, icon: '🚨' },
          { label: 'Clients',       value: stats.clients, icon: '🏢' },
          { label: 'Operators',     value: stats.operators, icon: '👷' },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs uppercase tracking-wide">{stat.label}</span>
              <span className="text-base sm:text-lg">{stat.icon}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5">
          <h2 className="font-semibold mb-4 text-sm sm:text-base">📷 Camera Status</h2>
          <div className="space-y-2">
            {cameras.length === 0 ? <p className="text-gray-500 text-sm">No cameras found</p> : cameras.map((cam: any) => (
              <div key={cam.id} className="flex items-center justify-between py-2 border-b border-gray-800">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-sm font-medium truncate">{cam.name}</p>
                  <p className="text-gray-500 text-xs truncate">{cam.client?.name}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded font-mono flex-shrink-0 ${cam.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cam.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5">
          <h2 className="font-semibold mb-4 text-sm sm:text-base">🚨 Recent Alerts</h2>
          <div className="space-y-2">
            {alerts.length === 0 ? <p className="text-gray-500 text-sm">No alerts yet</p> : alerts.map((alert: any) => (
              <div key={alert.id} className="flex items-start justify-between py-2 border-b border-gray-800">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-sm font-medium truncate">{alert.message}</p>
                  <p className="text-gray-500 text-xs truncate">{alert.camera?.name}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400 flex-shrink-0">{alert.severity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
