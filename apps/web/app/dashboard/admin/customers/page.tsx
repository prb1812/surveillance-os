'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';

interface Client {
  id: string; name: string; email: string; phone: string;
  address: string; plan: string; isActive: boolean;
  _count?: { cameras: number };
}

const PLANS = ['BASIC', 'STANDARD', 'PREMIUM'];
const empty = { name: '', email: '', phone: '', address: '', plan: 'BASIC', password: '' };

export default function CustomersPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const d = await api.get<Client[]>('/clients'); setClients(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(empty); setError(''); setShowModal(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email, phone: c.phone || '', address: c.address || '', plan: c.plan, password: '' });
    setError(''); setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.email) { setError('Name and email are required'); return; }
    if (!editing && !form.password) { setError('Password is required for new customer'); return; }
    setSaving(true);
    try {
      const payload: any = { name: form.name, email: form.email, phone: form.phone, address: form.address, plan: form.plan };
      if (form.password) payload.password = form.password;
      editing ? await api.patch(`/clients/${editing.id}`, payload) : await api.post('/clients', payload);
      setShowModal(false); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: Client) => {
    await api.patch(`/clients/${c.id}`, { isActive: !c.isActive });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this customer? This cannot be undone.')) return;
    await api.delete(`/clients/${id}`); load();
  };

  const planColor = (p: string) =>
    p === 'PREMIUM' ? 'bg-purple-500/20 text-purple-400' :
    p === 'STANDARD' ? 'bg-blue-500/20 text-blue-400' :
    'bg-gray-500/20 text-gray-400';

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-gray-400 text-sm mt-1">{clients.length} client businesses</p>
        </div>
        <button onClick={openAdd} className="bg-cyan-400 text-gray-950 px-4 py-2 rounded font-semibold hover:bg-cyan-300">+ Add Customer</button>
      </div>

      {loading ? <p className="text-gray-400">Loading...</p> : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="p-4 text-left">Business</th>
                <th className="p-4 text-left hidden md:table-cell">Phone</th>
                <th className="p-4 text-left">Plan</th>
                <th className="p-4 text-left hidden lg:table-cell">Cameras</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="p-4">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-gray-500 text-xs">{c.email}</p>
                  </td>
                  <td className="p-4 text-gray-400 text-sm hidden md:table-cell">{c.phone || '—'}</td>
                  <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${planColor(c.plan)}`}>{c.plan}</span></td>
                  <td className="p-4 text-gray-400 text-sm hidden lg:table-cell">{c._count?.cameras ?? 0}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${c.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {c.isActive ? 'ACTIVE' : 'SUSPENDED'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEdit(c)} className="text-cyan-400 text-xs hover:underline">Edit</button>
                      <button onClick={() => toggleActive(c)} className="text-yellow-400 text-xs hover:underline">{c.isActive ? 'Suspend' : 'Activate'}</button>
                      <button onClick={() => remove(c.id)} className="text-red-400 text-xs hover:underline">Delete</button>
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
              <h2 className="text-xl font-bold mb-6">{editing ? 'Edit Customer' : 'Add New Customer'}</h2>
              {error && <p className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/20 rounded p-3">{error}</p>}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Business Name *</label>
                    <input className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Email / Username *</label>
                    <input type="email" className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="owner@business.com" />
                    <p className="text-gray-600 text-xs mt-1">Used to log in</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Phone Number</label>
                    <input className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">Subscription Plan</label>
                    <select className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                      <option value="BASIC">BASIC (7 days retention)</option>
                      <option value="STANDARD">STANDARD (30 days retention)</option>
                      <option value="PREMIUM">PREMIUM (90 days retention)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Business Address</label>
                  <textarea className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none resize-none" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main Street, City, State" />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">Login Password * <span className="text-gray-600 text-xs">(set by admin)</span></label>
                  <input type="password" className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? 'Leave blank to keep current password' : 'Min 8 characters'} />
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500">
                  <p className="font-semibold text-gray-400 mb-1">Login Credentials (share with customer):</p>
                  <p>• Username: <span className="text-gray-300">{form.email || '—'}</span></p>
                  <p>• Password: <span className="text-gray-300">{form.password ? '••••••••' : '—'}</span></p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-700 rounded text-sm text-gray-400 hover:text-white">Cancel</button>
                <button onClick={save} disabled={saving} className="px-6 py-2 bg-cyan-400 text-gray-950 rounded text-sm font-semibold hover:bg-cyan-300 disabled:opacity-50">
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
