'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);

      // Get user from localStorage to check role
      const user = JSON.parse(localStorage.getItem('user') || '{}');

      // Redirect based on role
      if (user.role === 'SUPER_ADMIN') {
        router.push('/dashboard/admin');
      } else if (user.role === 'OPERATOR') {
        router.push('/dashboard/operator');
      } else if (user.role === 'CUSTOMER') {
        router.push('/dashboard/customer');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,212,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,212,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-cyan-400 rounded" />
            <span className="text-white text-2xl font-bold tracking-tight">
              Surveillance<span className="text-cyan-400">OS</span>
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            AI-Powered Surveillance Management
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <h2 className="text-white text-xl font-semibold mb-6">
            Sign in to your account
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-400 hover:bg-cyan-300 text-gray-950 font-semibold py-3 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Test credentials */}
          <div className="mt-6 p-4 bg-gray-800/50 rounded border border-gray-700">
            <p className="text-gray-400 text-xs mb-2 font-mono">
              TEST CREDENTIALS:
            </p>
            <div className="space-y-1 text-xs font-mono">
              <p className="text-cyan-400">
                Admin: admin@surveillanceos.com
              </p>
              <p className="text-purple-400">
                Operator: operator1@surveillanceos.com
              </p>
              <p className="text-green-400">
                Customer: owner@acmecorp.com
              </p>
              <p className="text-gray-500">Password: Password123!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}