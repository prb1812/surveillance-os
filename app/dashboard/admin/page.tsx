'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    cameras: 0,
    onlineCameras: 0,
    alerts: 0,
    clients: 0,
    operators: 0,
  });
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'SUPER_ADMIN') {
      router.push('/login');
      return;
    }
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      const [camerasRes, alertsRes, clientsRes, usersRes] = await Promise.all([
        api.get('/cameras'),
        api.get('/alerts'),
        api.get('/clients'),
        api.get('/users'),
      ]);

      const camerasData = camerasRes.data;
      const alertsData = alertsRes.data;
      const clientsData = clientsRes.data;
      const usersData = usersRes.data;

      setCameras(camerasData);
      setAlerts(alertsData.slice(0, 5));
      setStats({
        cameras: camerasData.length,
        onlineCameras: camerasData.filter((c: any) => c.status === 'ONLINE').length,
        alerts: alertsData.filter((a: any) => a.status === 'OPEN').length,
        clients: clientsData.length,
        operators: usersData.filter((u: any) => u.role === 'OPERATOR').length,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-cyan-400 text-xl animate-pulse">
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-cyan-400 rounded" />
            <span className="text-white font-bold text-lg">
              Surveillance<span className="text-cyan-400">OS</span>
            </span>
            <span className="text-gray-500 text-sm ml-4">Super Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">{user?.name}</span>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-400 text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 min-h-screen p-4">
          <nav className="space-y-1">
            {[
              { label: 'Dashboard', href: '/dashboard/admin', icon: '📊' },
              { label: 'Live View', href: '/dashboard/admin/live', icon: '📹' },
              { label: 'Playback', href: '/dashboard/admin/playback', icon: '⏪' },
              { label: 'Customers', href: '/dashboard/admin/customers', icon: '🏢' },
              { label: 'Operators', href: '/dashboard/admin/operators', icon: '👷' },
              { label: 'Cameras', href: '/dashboard/admin/cameras', icon: '📷' },
              { label: 'Alerts', href: '/dashboard/admin/alerts', icon: '🚨' },
              { label: 'ANPR', href: '/dashboard/admin/anpr', icon: '🚗' },
              { label: 'Analytics', href: '/dashboard/admin/analytics', icon: '📈' },
              { label: 'Settings', href: '/dashboard/admin/settings', icon: '⚙️' },
            ].map((item) => (
              
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              Platform overview — {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Total Cameras', value: stats.cameras, color: 'cyan', icon: '📷' },
              { label: 'Online Now', value: stats.onlineCameras, color: 'green', icon: '🟢' },
              { label: 'Open Alerts', value: stats.alerts, color: 'red', icon: '🚨' },
              { label: 'Clients', value: stats.clients, color: 'purple', icon: '🏢' },
              { label: 'Operators', value: stats.operators, color: 'yellow', icon: '👷' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-xs uppercase tracking-wide">
                    {stat.label}
                  </span>
                  <span className="text-lg">{stat.icon}</span>
                </div>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cameras Status */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                📷 Camera Status
              </h2>
              <div className="space-y-3">
                {cameras.length === 0 ? (
                  <p className="text-gray-500 text-sm">No cameras found</p>
                ) : (
                  cameras.map((camera: any) => (
                    <div
                      key={camera.id}
                      className="flex items-center justify-between py-2 border-b border-gray-800"
                    >
                      <div>
                        <p className="text-white text-sm font-medium">
                          {camera.name}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {camera.client?.name} • {camera.location}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-mono ${
                          camera.status === 'ONLINE'
                            ? 'bg-green-500/20 text-green-400'
                            : camera.status === 'RECORDING'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {camera.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                🚨 Recent Alerts
              </h2>
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No alerts found</p>
                ) : (
                  alerts.map((alert: any) => (
                    <div
                      key={alert.id}
                      className="flex items-start justify-between py-2 border-b border-gray-800"
                    >
                      <div>
                        <p className="text-white text-sm font-medium">
                          {alert.message}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {alert.camera?.name} •{' '}
                          {new Date(alert.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded font-mono ml-2 ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-500/20 text-red-400'
                            : alert.severity === 'HIGH'
                            ? 'bg-orange-500/20 text-orange-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}