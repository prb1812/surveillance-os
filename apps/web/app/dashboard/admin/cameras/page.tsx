'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';


interface Camera { id: string; name: string; location: string; rtspUrl: string; status: string; }

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [form, setForm] = useState({ name: '', location: '', rtspUrl: '' });
  const [error, setError] = useState('');

  const load = async () => { setLoading(true); const d = await api.get<Camera[]>('/cameras'); setCameras(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      editing ? await api.patch(`/cameras/${editing.id}`, form) : await api.post('/cameras', form);
      setShowModal(false); load();
    } catch (e: any) { setError(e.message); }
  };

  const remove = async (id: string) => { if (!confirm('Delete?')) return; await api.delete(`/cameras/${id}`); load(); };

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Cameras</h1>
        <button onClick={() => { setEditing(null); setForm({ name: '', location: '', rtspUrl: '' }); setShowModal(true); }} className="bg-cyan-400 text-gray-950 px-4 py-2 rounded font-semibold hover:bg-cyan-300">+ Add Camera</button>
      </div>
      {loading ? <p className="text-gray-400">Loading...</p> : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-800 text-gray-400 text-sm"><th className="p-4 text-left">Name</th><th className="p-4 text-left">Location</th><th className="p-4 text-left">Status</th><th className="p-4 text-left">Actions</th></tr></thead>
            <tbody>
              {cameras.map(cam => (
                <tr key={cam.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="p-4">{cam.name}</td>
                  <td className="p-4 text-gray-400">{cam.location}</td>
                  <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${cam.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cam.status}</span></td>
                  <td className="p-4 space-x-3">
                    <button onClick={() => { setEditing(cam); setForm({ name: cam.name, location: cam.location, rtspUrl: cam.rtspUrl }); setShowModal(true); }} className="text-cyan-400 text-sm hover:underline">Edit</button>
                    <button onClick={() => remove(cam.id)} className="text-red-400 text-sm hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Edit' : 'Add'} Camera</h2>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            {(['name', 'location', 'rtspUrl'] as const).map(f => (
              <div key={f} className="mb-4">
                <label className="block text-gray-400 text-sm mb-1 capitalize">{f}</label>
                <input className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded" value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} />
              </div>
            ))}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-700 rounded text-sm">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-cyan-400 text-gray-950 rounded text-sm font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
