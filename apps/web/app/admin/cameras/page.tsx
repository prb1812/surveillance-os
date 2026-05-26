'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Camera {
  id: string;
  name: string;
  location: string;
  rtspUrl: string;
  status: 'ONLINE' | 'OFFLINE';
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [form, setForm] = useState({ name: '', location: '', rtspUrl: '' });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Camera[]>('/cameras');
      setCameras(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', location: '', rtspUrl: '' });
    setShowModal(true);
  };

  const openEdit = (cam: Camera) => {
    setEditing(cam);
    setForm({ name: cam.name, location: cam.location, rtspUrl: cam.rtspUrl });
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.patch(`/cameras/${editing.id}`, form);
      } else {
        await api.post('/cameras', form);
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this camera?')) return;
    await api.delete(`/cameras/${id}`);
    load();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Cameras</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + Add Camera
        </button>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading ? <p>Loading...</p> : (
        <table className="w-full border-collapse bg-white rounded shadow">
          <thead>
            <tr className="bg-gray-100 text-left text-sm font-semibold">
              <th className="p-3">Name</th>
              <th className="p-3">Location</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((cam) => (
              <tr key={cam.id} className="border-t hover:bg-gray-50">
                <td className="p-3">{cam.name}</td>
                <td className="p-3">{cam.location}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${cam.status === 'ONLINE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {cam.status}
                  </span>
                </td>
                <td className="p-3 space-x-2">
                  <button onClick={() => openEdit(cam)} className="text-blue-600 hover:underline text-sm">Edit</button>
                  <button onClick={() => remove(cam.id)} className="text-red-600 hover:underline text-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Edit Camera' : 'Add Camera'}</h2>
            {['name', 'location', 'rtspUrl'].map((field) => (
              <div key={field} className="mb-4">
                <label className="block text-sm font-medium capitalize mb-1">{field}</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={form[field as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
