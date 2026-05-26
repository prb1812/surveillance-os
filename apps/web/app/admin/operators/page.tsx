'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Operator {
  id: string;
  name: string;
  email: string;
}

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const data = await api.get<Operator[]>('/users?role=OPERATOR');
    setOperators(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post('/users', { ...form, role: 'OPERATOR' });
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete operator?')) return;
    await api.delete(`/users/${id}`);
    load();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Operators</h1>
        <button onClick={() => { setForm({ name: '', email: '', password: '' }); setShowModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + Add Operator
        </button>
      </div>
      {loading ? <p>Loading...</p> : (
        <table className="w-full bg-white rounded shadow border-collapse">
          <thead>
            <tr className="bg-gray-100 text-sm font-semibold text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} className="border-t hover:bg-gray-50">
                <td className="p-3">{op.name}</td>
                <td className="p-3 text-sm text-gray-600">{op.email}</td>
                <td className="p-3">
                  <button onClick={() => remove(op.id)} className="text-red-600 text-sm hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">Add Operator</h2>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            {['name', 'email', 'password'].map((f) => (
              <div key={f} className="mb-4">
                <label className="block text-sm font-medium capitalize mb-1">{f}</label>
                <input type={f === 'password' ? 'password' : 'text'} className="w-full border rounded px-3 py-2 text-sm" value={form[f as keyof typeof form]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
              </div>
            ))}
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
