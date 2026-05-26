'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';

const adminNavItems = [
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
];

export default function CamerasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [cameras, setCameras] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCamera, setEditCamera] = useState<any>(null);
  const [form, setForm] = useState({
    name: '', location: '', rtspUrl: '', clientId: '',
  });

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'SUPER_ADMIN') { router.push('/login'); return; }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [c, cl] = await Promise.all([
        api.get('/cameras'),
        api.get('/clients'),
      ]);
      setCameras(c.data);
      setClients(cl.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editCamera) {
        await api.patch(`/cameras/${editCamera.id}`, form);
      } else {
        await api.post('/cameras', form);
      }
      setShowAddModal(false);
      setEditCamera(null);
      setForm({ name: '', location: '', rtspUrl: '', clientId: '' });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Disable this camera?')) return;
    try {
      await api.delete(`/cameras/${id}`);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const openEdit = (camera: any) => {
    setEditCamera(camera);
    setForm({
      name: camera.name,
      location: camera.location || '',
      rtspUrl: camera.rtspUrl,
      clientId: camera.clientId,
    });
    setShowAddModal(true);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-cyan-400 animate-pulse">Loading...</div>
    </div>
  );

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Camera Management</h1>
          <p className="text-gray-400 text-sm mt-1">{cameras.length} cameras total</p>
        </div>
        <button
          onClick={() => { setEditCamera(null); setForm({ name: '', location: '', rtspUrl: '', clientId: '' }); setShowAddModal(true); }}
          className="bg-cyan-400 hover:bg-cyan-300 text-gray-950 font-semibold px-4 py-2 rounded text-sm transition-colors w-full sm:w-auto"
        >
          + Add Camera
        </button>
      </div>

      {/* Cameras Table - responsive */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-400 text-xs uppercase">Camera</th>
                <th className="px-4 py-3 text-gray-400 text-xs uppercase">Client</th>
                <th className="px-4 py-3 text-gray-400 text-xs uppercase">Location</th>
                <th className="px-4 py-3 text-gray-400 text-xs uppercase">Status</th>
                <th className="px-4 py-3 text-gray-400 text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((camera: any) => (
                <tr key={camera.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <p className="text-white text-sm font-medium">{camera.name}</p>
                    <p className="text-gray-500 text-xs font-mono truncate max-w-48">{camera.rtspUrl}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{camera.client?.name}</td>
                  <td className="px-4 py-3 text-gray-300 text-sm">{camera.location || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded font-mono ${
                      camera.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' :
                      camera.status === 'RECORDING' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {camera.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(camera)}
                        className="text-cyan-400 hover:text-cyan-300 text-xs px-2 py-1 border border-cyan-400/30 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(camera.id)}
                        className="text-red-400 hover:text-red-300 text-xs px-2 py-1 border border-red-400/30 rounded"
                      >
                        Disable
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-gray-800">
          {cameras.map((camera: any) => (
            <div key={camera.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-white font-medium">{camera.name}</p>
                  <p className="text-gray-400 text-xs">{camera.client?.name}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded font-mono ${
                  camera.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {camera.status}
                </span>
              </div>
              <p className="text-gray-500 text-xs mb-3">{camera.location || 'No location'}</p>
              <div className="flex gap-2">
                <button onClick={() => openEdit(camera)} className="text-cyan-400 text-xs px-3 py-1 border border-cyan-400/30 rounded flex-1">Edit</button>
                <button onClick={() => handleDelete(camera.id)} className="text-red-400 text-xs px-3 py-1 border border-red-400/30 rounded flex-1">Disable</button>
              </div>
            </div>
          ))}
        </div>

        {cameras.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-3">📷</p>
            <p>No cameras found. Add your first camera!</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-white font-semibold mb-4">
              {editCamera ? 'Edit Camera' : 'Add New Camera'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Camera Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-cyan-400"
                  placeholder="Front Entrance Camera"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-cyan-400"
                  placeholder="Building A - Ground Floor"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">RTSP URL</label>
                <input
                  value={form.rtspUrl}
                  onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-cyan-400 font-mono"
                  placeholder="rtsp://192.168.1.100:554/stream1"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Client</label>
                <select
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Select client...</option>
                  {clients.map((client: any) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-gray-800 text-gray-400 py-2 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-cyan-400 text-gray-950 font-semibold py-2 rounded text-sm"
                >
                  {editCamera ? 'Update' : 'Add Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
