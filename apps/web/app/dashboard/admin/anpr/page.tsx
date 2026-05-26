'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';


export default function AnprPage() {
  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <h1 className="text-2xl font-bold mb-6">ANPR</h1>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-4xl mb-4">🚗</p>
        <p className="text-gray-400">Automatic Number Plate Recognition — Coming Soon</p>
      </div>
    </DashboardLayout>
  );
}
