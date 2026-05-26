'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Client {
  id: string;
  name: string;
  email: string;
  plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
  _count?: { cameras: number };
}

const PLANS = ['BASIC', 'STANDARD', 'PREMIUM'];

export default function CustomersPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: '', email: '', plan: 'BASIC' });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Client[]>('/clients');
      setClients(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing) {
        await api.patch(`/clients/${editing.id}`, form);
      } else {
        await api.post('/clients', form);
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this client?')) return;
    await api.delete(`/clients/${id}`);
    load();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button
          onClick={() => { setEditing(null); setForm({ name: '', email: '', plan: 'BASIC' }); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Add Customer
        </button>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading ? <p>Loading...</p> : (
        <table className="w-full bg-white rounded shadow border-collapse">
          <thead>
            <tr className="bg-gray-100 text-sm font-semibold text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Cameras</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="p-3">{c.name}</td>
                <td className="p-3 text-sm text-gray-600">{c.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${c.plan === 'PREMIUM' ? 'bg-purple-100 text-purple-700' : c.plan === 'STANDARD' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                    {c.plan}
                  </span>
                </td>
                <td className="p-3">{c._count?.cameras ?? '—'}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => { setEditing(c); setForm({ name: c.name, email: c.email, plan: c.plan }); setShowModal(true); }} className="text-blue-600 text-sm hover:underline">Edit</button>
                  <button onClick={() => remove(c.id)} className="text-red-600 text-sm hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">{editing ? 'Edit' : 'Add'} Customer</h2>
            {['name', 'email'].map((f) => (
              <div key={f} className="mb-4">
                <label className="block text-sm font-medium capitalize mb-1">{f}</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={form[f as 'name' | 'email']} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
              </div>
            ))}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Plan</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {PLANS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
