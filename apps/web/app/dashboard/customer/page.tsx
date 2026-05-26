'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { customerNavItems } from '@/lib/nav-items';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [cameras, setCameras] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0, alertsToday: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'CUSTOMER') { router.push('/login'); return; }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [c, a] = await Promise.all([
        api.get<any[]>('/cameras'),
        api.get<any[]>('/alerts'),
      ]);
      setCameras(c);
      setAlerts(a.slice(0, 5));
      const today = new Date().toDateString();
      setStats({
        total: c.length, online: c.filter((x: any) => x.status === 'ONLINE').length,
        offline: c.filter((x: any) => x.status === 'OFFLINE').length,
        alertsToday: a.filter((x: any) => new Date(x.createdAt).toDateString() === today).length,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-green-400 text-xl animate-pulse">Loading...</div></div>;

  return (
    <DashboardLayout navItems={customerNavItems} role="CUSTOMER">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">My Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">{new Date().toLocaleDateString()}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'My Cameras', value: stats.total, icon: '📷' },
          { label: 'Online', value: stats.online, icon: '🟢' },
          { label: 'Offline', value: stats.offline, icon: '🔴' },
          { label: 'Alerts Today', value: stats.alertsToday, icon: '🚨' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400 text-xs uppercase tracking-wide">{s.label}</span>
              <span>{s.icon}</span>
            </div>
            <div className="text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">📷 My Cameras</h2>
            <a href="/dashboard/customer/live" className="text-green-400 text-xs hover:underline">View Live →</a>
          </div>
          <div className="space-y-2">
            {cameras.length === 0 ? <p className="text-gray-500 text-sm">No cameras</p> :
              cameras.map(cam => (
                <div key={cam.id} className="flex items-center justify-between py-2 border-b border-gray-800">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-medium truncate">{cam.name}</p>
                    <p className="text-gray-500 text-xs truncate">{cam.location}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-mono flex-shrink-0 ${cam.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cam.status}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">🚨 My Alerts</h2>
            <a href="/dashboard/customer/alerts" className="text-green-400 text-xs hover:underline">View All →</a>
          </div>
          <div className="space-y-2">
            {alerts.length === 0 ? <p className="text-gray-500 text-sm">No alerts</p> :
              alerts.map(alert => (
                <div key={alert.id} className="flex items-start justify-between py-2 border-b border-gray-800">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-medium truncate">{alert.message || alert.type}</p>
                    <p className="text-gray-500 text-xs">{new Date(alert.createdAt).toLocaleTimeString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded flex-shrink-0 ${alert.status === 'RESOLVED' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{alert.status}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Plan Details */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-4">📋 My Plan</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Plan</span>
              <span className="text-white font-semibold">BASIC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Recording Retention</span>
              <span className="text-white">7 days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Max Cameras</span>
              <span className="text-white">{stats.total} / 5</span>
            </div>
            <div className="mt-3 p-3 bg-gray-800 rounded-lg text-xs text-gray-500">
              To upgrade your plan, contact your administrator.
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
