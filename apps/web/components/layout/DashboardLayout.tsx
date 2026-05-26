'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  navItems: NavItem[];
  role: string;
}

export default function DashboardLayout({ children, navItems, role }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'text-cyan-400',
    OPERATOR: 'text-purple-400',
    CUSTOMER: 'text-green-400',
  };

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    OPERATOR: 'Operator',
    CUSTOMER: 'Customer',
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-3">
          {/* Hamburger for mobile */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden text-gray-400 hover:text-white p-1"
          >
            <div className="w-5 h-0.5 bg-current mb-1" />
            <div className="w-5 h-0.5 bg-current mb-1" />
            <div className="w-5 h-0.5 bg-current" />
          </button>

          <div className="w-6 h-6 bg-cyan-400 rounded flex-shrink-0" />
          <span className="font-bold text-base sm:text-lg">
            Surveillance<span className="text-cyan-400">OS</span>
          </span>
          <span className={`text-xs sm:text-sm hidden sm:block ${roleColors[role] || 'text-gray-400'}`}>
            {roleLabels[role] || role}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-gray-400 text-xs sm:text-sm hidden sm:block truncate max-w-32">
            {user?.name}
          </span>
          <button
            onClick={logout}
            className="text-gray-400 hover:text-red-400 text-xs sm:text-sm transition-colors px-2 py-1 border border-gray-700 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex pt-14">
        {/* Sidebar */}
        <aside className={`
          fixed lg:static top-14 left-0 z-40
          w-64 bg-gray-900 border-r border-gray-800
          min-h-screen h-full p-4
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>

          {/* User info at bottom of sidebar */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs truncate">{user?.email}</p>
              <span className={`text-xs font-mono ${roleColors[role]}`}>
                {roleLabels[role]}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}