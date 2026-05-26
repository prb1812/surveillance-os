'use client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { operatorNavItems } from '@/lib/nav-items';
export default function Page() {
  return (
    <DashboardLayout navItems={operatorNavItems} role="OPERATOR">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-4xl mb-4">🔲</p>
        <p className="text-gray-400 capitalize">settings — Coming Soon</p>
      </div>
    </DashboardLayout>
  );
}
