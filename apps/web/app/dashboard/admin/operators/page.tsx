'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';

interface Operator {
  id: string; name: string; email: string; phone: string;
  shiftStart: string; shiftEnd: string; status: string;
}

const empty = { name: '', email: '', phone: '', password: '', shiftStart: '09:00', shiftEnd: '18:00', emergencyContact: '', address: '' };

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const d = await api.get<Operator[]>('/users?role=OPERATOR'); setOperators(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true); };
  const openEdit = (op: Operator) => {
    setEditing(op);
    setForm({ name: op.name, email: op.email, phone: op.phone || '', password: '', shiftStart: op.shiftStart || '09:00', shiftEnd: op.shiftEnd || '18:00', emergencyContact: '', address: '' });
    setError(''); setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.email) { setError('Name and email are required'); return; }
    if (!editing && !form.password) { setError('Password is required for new operator'); return; }
    setSaving(true);
    try {
      const payload: any = { name: form.name, email: form.email, phone: form.phone, shiftStart: form.shiftStart, shiftEnd: form.shiftEnd, emergencyContact: form.emergencyContact, address: form.address, role: 'OPERATOR' };
      if (!editing) payload.password = form.password;
      editing ? await api.patch(`/users/${editing.id}`, payload) : await api.post('/users', payload);
      setShowModal(false); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const suspend = async (op: Operator) => {
    await api.patch(`/users/${op.id}`, { status: op.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
    load();
  };

  const remove = async (id: string) => { if (!confirm('Delete this operator?')) return; await api.delete(`/users/${id}`); load(); };

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Operators</h1>
          <p className="text-gray-400 text-sm mt-1">{operators.length} control room staff</p>
        </div>
        <button onClick={openAdd} className="bg-cyan-400 text-gray-950 px-4 py-2 rounded font-semibold hover:bg-cyan-300">+ Add Operator</button>
      </div>

      {loading ? <p className="text-gray-400">Loading...</p> : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="p-4 text-left">Operator</th>
                <th className="p-4 text-left hidden md:table-cell">Phone</th>
                <th className="p-4 text-left hidden lg:table-cell">Shift</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {operators.map(op => (
                <tr key={op.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="p-4">
                    <p className="font-medium">{op.name}</p>
                    <p className="text-gray-500 text-xs">{op.email}</p>
                  </td>
                  <td className="p-4 text-gray-400 text-sm hidden md:table-cell">{op.phone || '—'}</td>
                  <td className="p-4 text-gray-400 text-sm hidden lg:table-cell">
                    {op.shiftStart && op.shiftEnd ? `${op.shiftStart} – ${op.shiftEnd}` : '—'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${op.status === 'ACTIVE' || !op.status ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {op.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEdit(op)} className="text-cyan-400 text-xs hover:underline">Edit</button>
                      <button onClick={() => suspend(op)} className="text-yellow-400 text-xs hover:underline">{op.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}</button>
                      <button onClick={() => remove(op.id)} className="text-red-400 text-xs hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-6">{editing ? 'Edit Operator' : 'Add New Operator'}</h2>
              {error && <p className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/20 rounded p-3">{error}</p>}

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Full Name *</label>
                    <input className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Email Address *</label>
                    <input type="email" className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="operator@company.com" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Phone Number</label>
                    <input className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Emergency Contact</label>
                    <input className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-1">Home Address</label>
                  <textarea className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none resize-none" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main Street, City" />
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Shift Timings</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-500 text-xs mb-1">Shift Start</label>
                      <input type="time" className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.shiftStart} onChange={e => setForm({ ...form, shiftStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-gray-500 text-xs mb-1">Shift End</label>
                      <input type="time" className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.shiftEnd} onChange={e => setForm({ ...form, shiftEnd: e.target.value })} />
                    </div>
                  </div>
                </div>

                {!editing && (
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Login Password *</label>
                    <input type="password" className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-700 rounded text-sm text-gray-400 hover:text-white">Cancel</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-cyan-400 text-gray-950 rounded text-sm font-semibold hover:bg-cyan-300 disabled:opacity-50">
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Operator'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
