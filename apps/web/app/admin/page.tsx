"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Camera {
  id: string; name: string; location: string; rtspUrl: string;
  hlsPath: string | null; status: "ONLINE" | "OFFLINE" | "RECORDING";
  isActive: boolean; clientId: string; client: { id: string; name: string };
}
interface Alert {
  id: string; type: string; message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  cameraId: string; createdAt: string; camera?: { name: string };
}
interface Client {
  id: string; name: string; email: string; phone: string;
  plan: "BASIC" | "STANDARD" | "PREMIUM"; isActive: boolean;
  _count: { cameras: number; users: number; alerts: number };
}
interface User {
  id: string; name: string; email: string;
  role: "SUPER_ADMIN" | "OPERATOR" | "CUSTOMER";
  isActive: boolean; clientId: string | null; lastLoginAt: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

async function apiFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { localStorage.clear(); window.location.href = "/login"; throw new Error("Unauth"); }
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}
async function apiPatch(path: string, body: object) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const SEV: Record<string, string> = { LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#f97316", CRITICAL: "#ef4444" };
const PLAN: Record<string, string> = { BASIC: "#6366f1", STANDARD: "#0ea5e9", PREMIUM: "#f59e0b" };

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NAV = [
  { icon: "dashboard", label: "Overview", id: "overview" },
  { icon: "videocam", label: "Live View", id: "live" },
  { icon: "camera_alt", label: "Cameras", id: "cameras" },
  { icon: "notifications", label: "Alerts", id: "alerts" },
  { icon: "business", label: "Clients", id: "clients" },
  { icon: "manage_accounts", label: "Operators", id: "operators" },
  { icon: "directions_car", label: "ANPR", id: "anpr" },
  { icon: "bar_chart", label: "Analytics", id: "analytics" },
];

function Sidebar({ active, onNav, collapsed, onToggle }: { active: string; onNav: (id: string) => void; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sb-header">
        {!collapsed && <div className="brand"><span className="mi">security</span><span className="brand-name">SurveillanceOS</span></div>}
        <button className="icon-btn" onClick={onToggle}><span className="mi">{collapsed ? "menu" : "menu_open"}</span></button>
      </div>
      <nav className="sb-nav">
        {NAV.map(n => (
          <button key={n.id} className={`nav-item${active === n.id ? " active" : ""}`} onClick={() => onNav(n.id)}>
            <span className="mi">{n.icon}</span>{!collapsed && <span>{n.label}</span>}
          </button>
        ))}
      </nav>
      <div className="sb-footer">
        <button className="nav-item logout" onClick={() => { localStorage.clear(); window.location.href = "/login"; }}>
          <span className="mi">logout</span>{!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}

function Stat({ label, value, sub, color, icon }: { label: string; value: number | string; sub?: string; color: string; icon: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + "22", color }}><span className="mi">{icon}</span></div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value" style={{ color }}>{value}</p>
        {sub && <p className="stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

function CamBadge({ status }: { status: Camera["status"] }) {
  const m = { ONLINE: { c: "#22c55e", l: "Online" }, OFFLINE: { c: "#6b7280", l: "Offline" }, RECORDING: { c: "#ef4444", l: "● REC" } };
  const s = m[status] ?? m.OFFLINE;
  return <span className="badge" style={{ color: s.c, borderColor: s.c + "44", background: s.c + "11" }}>{s.l}</span>;
}

function Overview({ cameras, alerts, clients, users, loading, onRefresh }: { cameras: Camera[]; alerts: Alert[]; clients: Client[]; users: User[]; loading: boolean; onRefresh: () => void }) {
  const onlineCams = cameras.filter(c => c.status === "ONLINE" || c.status === "RECORDING").length;
  const openAlerts = alerts.filter(a => a.status === "OPEN").length;
  const activeClients = clients.filter(c => c.isActive).length;
  const operators = users.filter(u => u.role === "OPERATOR").length;
  const alertChart = (() => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000); days[d.toLocaleDateString("en", { weekday: "short" })] = 0; }
    alerts.forEach(a => { const l = new Date(a.createdAt).toLocaleDateString("en", { weekday: "short" }); if (l in days) days[l]++; });
    return Object.entries(days).map(([day, count]) => ({ day, count }));
  })();
  return (
    <div className="panel">
      <div className="panel-head"><h1 className="panel-title">Overview</h1>
        <button className="icon-btn" onClick={onRefresh}><span className={`mi${loading ? " spin" : ""}`}>refresh</span></button>
      </div>
      <div className="stats-grid">
        <Stat label="Total Cameras" value={cameras.length} sub={`${onlineCams} online`} color="#0ea5e9" icon="videocam" />
        <Stat label="Open Alerts" value={openAlerts} sub={`${alerts.length} total`} color="#ef4444" icon="notifications_active" />
        <Stat label="Active Clients" value={activeClients} sub={`${clients.length} total`} color="#22c55e" icon="business" />
        <Stat label="Operators" value={operators} color="#f59e0b" icon="manage_accounts" />
      </div>
      <div className="charts-row">
        <div className="chart-card">
          <p className="chart-title">Alerts — last 7 days</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={alertChart}>
              <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0f" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1a1e2e", border: "1px solid #ffffff12", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#ag)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <p className="chart-title">Camera status</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={[{ name: "Online", value: onlineCams }, { name: "Offline", value: cameras.length - onlineCams }]} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0f" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1a1e2e", border: "1px solid #ffffff12", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="tbl-card">
        <p className="tbl-heading">Cameras</p>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Location</th><th>Client</th><th>Status</th></tr></thead>
          <tbody>
            {cameras.length === 0 ? <tr><td colSpan={4} className="empty">No cameras</td></tr>
              : cameras.map(c => <tr key={c.id}><td className="fw5">{c.name}</td><td className="muted">{c.location}</td><td className="muted">{c.client?.name ?? "—"}</td><td><CamBadge status={c.status} /></td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="tbl-card">
        <p className="tbl-heading">Recent alerts</p>
        <table className="tbl">
          <thead><tr><th>Type</th><th>Message</th><th>Severity</th><th>Status</th><th>Time</th><th>Actions</th></tr></thead>
          <tbody>
            {alerts.length === 0 ? <tr><td colSpan={6} className="empty">No alerts — system is clean ✓</td></tr>
              : alerts.slice(0, 6).map(a => (
                <tr key={a.id}>
                  <td className="fw5">{a.type}</td><td className="muted trunc">{a.message}</td>
                  <td><span className="sev-pill" style={{ background: SEV[a.severity] + "22", color: SEV[a.severity] }}>{a.severity}</span></td>
                  <td><span className={`alert-status as-${a.status.toLowerCase()}`}>{a.status}</span></td>
                  <td className="muted small">{timeAgo(a.createdAt)}</td>
                  <td className="actions-cell">
                    {a.status === "OPEN" && <button className="xs-btn ghost" onClick={() => apiPatch(`/alerts/${a.id}/acknowledge`, {}).then(onRefresh)}>Ack</button>}
                    {a.status !== "RESOLVED" && <button className="xs-btn danger" onClick={() => apiPatch(`/alerts/${a.id}/resolve`, {}).then(onRefresh)}>Resolve</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CamerasPanel({ cameras, loading, onRefresh }: { cameras: Camera[]; loading: boolean; onRefresh: () => void }) {
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("ALL");
  const filtered = cameras.filter(c => (filter === "ALL" || c.status === filter) && (c.name.toLowerCase().includes(search.toLowerCase()) || c.location.toLowerCase().includes(search.toLowerCase())));
  return (
    <div className="panel">
      <div className="panel-head"><h1 className="panel-title">Cameras</h1><button className="icon-btn" onClick={onRefresh}><span className={`mi${loading ? " spin" : ""}`}>refresh</span></button></div>
      <div className="filter-bar">
        <input className="search-in" placeholder="Search cameras..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="tabs">{["ALL", "ONLINE", "OFFLINE", "RECORDING"].map(s => <button key={s} className={`tab${filter === s ? " active" : ""}`} onClick={() => setFilter(s)}>{s}</button>)}</div>
      </div>
      <div className="tbl-card">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Location</th><th>Client</th><th>RTSP URL</th><th>Status</th><th>Active</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={6} className="empty">No cameras match</td></tr>
              : filtered.map(c => (
                <tr key={c.id}>
                  <td className="fw5">{c.name}</td><td className="muted">{c.location}</td><td className="muted">{c.client?.name ?? "—"}</td>
                  <td className="mono small muted">{c.rtspUrl}</td><td><CamBadge status={c.status} /></td>
                  <td><span className="badge" style={c.isActive ? { color: "#22c55e", borderColor: "#22c55e44", background: "#22c55e11" } : { color: "#6b7280", borderColor: "#6b728044", background: "#6b728011" }}>{c.isActive ? "Yes" : "No"}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsPanel({ alerts, loading, onRefresh }: { alerts: Alert[]; loading: boolean; onRefresh: () => void }) {
  const [statusF, setStatusF] = useState("ALL"); const [sevF, setSevF] = useState("ALL");
  const filtered = alerts.filter(a => (statusF === "ALL" || a.status === statusF) && (sevF === "ALL" || a.severity === sevF));
  return (
    <div className="panel">
      <div className="panel-head"><h1 className="panel-title">Alerts</h1><button className="icon-btn" onClick={onRefresh}><span className={`mi${loading ? " spin" : ""}`}>refresh</span></button></div>
      <div className="filter-bar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
        <div className="tabs"><span className="filter-label">Status:</span>{["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map(s => <button key={s} className={`tab${statusF === s ? " active" : ""}`} onClick={() => setStatusF(s)}>{s}</button>)}</div>
        <div className="tabs"><span className="filter-label">Severity:</span>{["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => <button key={s} className={`tab${sevF === s ? " active" : ""}`} style={s !== "ALL" ? { borderColor: SEV[s] + "66" } : undefined} onClick={() => setSevF(s)}>{s}</button>)}</div>
      </div>
      <div className="tbl-card">
        <table className="tbl">
          <thead><tr><th>Severity</th><th>Type</th><th>Message</th><th>Camera</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7} className="empty">No alerts match filters</td></tr>
              : filtered.map(a => (
                <tr key={a.id}>
                  <td><span className="sev-pill" style={{ background: SEV[a.severity] + "22", color: SEV[a.severity] }}>{a.severity}</span></td>
                  <td className="fw5">{a.type}</td><td className="muted trunc">{a.message}</td>
                  <td className="muted small">{a.camera?.name ?? a.cameraId}</td>
                  <td className="muted small">{timeAgo(a.createdAt)}</td>
                  <td><span className={`alert-status as-${a.status.toLowerCase()}`}>{a.status}</span></td>
                  <td className="actions-cell">
                    {a.status === "OPEN" && <button className="xs-btn ghost" onClick={() => apiPatch(`/alerts/${a.id}/acknowledge`, {}).then(onRefresh)}>Ack</button>}
                    {a.status !== "RESOLVED" && <button className="xs-btn danger" onClick={() => apiPatch(`/alerts/${a.id}/resolve`, {}).then(onRefresh)}>Resolve</button>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientsPanel({ clients, loading, onRefresh }: { clients: Client[]; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="panel">
      <div className="panel-head"><h1 className="panel-title">Clients</h1><button className="icon-btn" onClick={onRefresh}><span className={`mi${loading ? " spin" : ""}`}>refresh</span></button></div>
      <div className="tbl-card">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Plan</th><th>Cameras</th><th>Users</th><th>Status</th></tr></thead>
          <tbody>
            {clients.length === 0 ? <tr><td colSpan={7} className="empty">No clients</td></tr>
              : clients.map(c => (
                <tr key={c.id}>
                  <td className="fw5">{c.name}</td><td className="muted small">{c.email}</td><td className="muted small">{c.phone}</td>
                  <td><span className="plan-badge" style={{ background: PLAN[c.plan] + "22", color: PLAN[c.plan] }}>{c.plan}</span></td>
                  <td className="muted">{c._count.cameras}</td><td className="muted">{c._count.users}</td>
                  <td><span className="badge" style={c.isActive ? { color: "#22c55e", borderColor: "#22c55e44", background: "#22c55e11" } : { color: "#6b7280", borderColor: "#6b728044", background: "#6b728011" }}>{c.isActive ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperatorsPanel({ users, loading, onRefresh }: { users: User[]; loading: boolean; onRefresh: () => void }) {
  const operators = users.filter(u => u.role === "OPERATOR");
  return (
    <div className="panel">
      <div className="panel-head"><h1 className="panel-title">Operators</h1><button className="icon-btn" onClick={onRefresh}><span className={`mi${loading ? " spin" : ""}`}>refresh</span></button></div>
      <div className="tbl-card">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Last Login</th><th>Status</th></tr></thead>
          <tbody>
            {operators.length === 0 ? <tr><td colSpan={4} className="empty">No operators</td></tr>
              : operators.map(u => (
                <tr key={u.id}>
                  <td className="fw5">{u.name}</td><td className="muted small">{u.email}</td>
                  <td className="muted small">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                  <td><span className="badge" style={u.isActive ? { color: "#22c55e", borderColor: "#22c55e44", background: "#22c55e11" } : { color: "#6b7280", borderColor: "#6b728044", background: "#6b728011" }}>{u.isActive ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlaceholderPanel({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="panel">
      <div className="panel-head"><h1 className="panel-title">{title}</h1></div>
      <div className="placeholder"><span className="mi" style={{ fontSize: 48, color: "#334155" }}>{icon}</span><p style={{ color: "#64748b", marginTop: 12 }}>{title} — coming in next build</p></div>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [active, setActive] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [adminName, setAdminName] = useState("Super Admin");

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cam, alt, cli, usr] = await Promise.all([
        apiFetch<Camera[]>("/cameras"), apiFetch<Alert[]>("/alerts"),
        apiFetch<Client[]>("/clients"), apiFetch<User[]>("/users"),
      ]);
      setCameras(cam); setAlerts(alt); setClients(cli); setUsers(usr);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { router.push("/login"); return; }
    try {
      const u = JSON.parse(raw);
      if (u.role !== "SUPER_ADMIN") { router.push("/login"); return; }
      if (u.name) setAdminName(u.name);
    } catch { router.push("/login"); return; }
    fetchAll();
  }, [fetchAll, router]);

  const renderPanel = () => {
    switch (active) {
      case "overview": return <Overview cameras={cameras} alerts={alerts} clients={clients} users={users} loading={loading} onRefresh={fetchAll} />;
      case "cameras": return <CamerasPanel cameras={cameras} loading={loading} onRefresh={fetchAll} />;
      case "alerts": return <AlertsPanel alerts={alerts} loading={loading} onRefresh={fetchAll} />;
      case "clients": return <ClientsPanel clients={clients} loading={loading} onRefresh={fetchAll} />;
      case "operators": return <OperatorsPanel users={users} loading={loading} onRefresh={fetchAll} />;
      case "live": return <PlaceholderPanel title="Live View" icon="videocam" />;
      case "anpr": return <PlaceholderPanel title="ANPR" icon="directions_car" />;
      case "analytics": return <PlaceholderPanel title="Analytics" icon="bar_chart" />;
      default: return null;
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap" rel="stylesheet" />
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--bg:#0d0f1a;--surf:#141724;--surf2:#1a1e2e;--bdr:rgba(255,255,255,0.07);--bdr2:rgba(255,255,255,0.12);--txt:#e2e8f0;--txt2:#94a3b8;--txt3:#64748b;--accent:#0ea5e9;--font:'IBM Plex Sans',system-ui,sans-serif;--mono:'IBM Plex Mono',monospace;--r:8px;--rl:12px;--sw:220px;--sc:60px}
        body{font-family:var(--font);background:var(--bg);color:var(--txt);height:100vh;overflow:hidden}
        .layout{display:flex;height:100vh}
        .sidebar{width:var(--sw);background:var(--surf);border-right:1px solid var(--bdr);display:flex;flex-direction:column;transition:width 200ms ease;overflow:hidden;flex-shrink:0}
        .sidebar.collapsed{width:var(--sc)}
        .sb-header{display:flex;align-items:center;justify-content:space-between;padding:16px 12px;border-bottom:1px solid var(--bdr);min-height:60px}
        .brand{display:flex;align-items:center;gap:10px;overflow:hidden}
        .brand .mi{color:var(--accent);font-size:22px;flex-shrink:0}
        .brand-name{font-size:14px;font-weight:600;white-space:nowrap;letter-spacing:.02em}
        .sb-nav{flex:1;padding:8px 0;overflow-y:auto;overflow-x:hidden}
        .sb-footer{padding:8px 0;border-top:1px solid var(--bdr)}
        .nav-item{width:100%;display:flex;align-items:center;gap:12px;padding:10px 16px;background:none;border:none;cursor:pointer;color:var(--txt2);font-size:13.5px;font-family:var(--font);white-space:nowrap;transition:background 150ms,color 150ms}
        .nav-item:hover{background:var(--surf2);color:var(--txt)}
        .nav-item.active{background:#0ea5e911;color:var(--accent);border-left:2px solid var(--accent)}
        .nav-item.logout:hover{background:#ef444411;color:#ef4444}
        .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
        .topbar{height:60px;background:var(--surf);border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;padding:0 24px;flex-shrink:0}
        .topbar-role{font-size:12px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em}
        .topbar-user{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt2)}
        .avatar{width:30px;height:30px;border-radius:50%;background:#0ea5e933;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--accent);font-weight:600}
        .content{flex:1;overflow-y:auto;padding:24px}
        .panel{max-width:1200px}
        .panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
        .panel-title{font-size:22px;font-weight:600;letter-spacing:-.02em}
        .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
        .stat-card{background:var(--surf);border:1px solid var(--bdr);border-radius:var(--rl);padding:18px;display:flex;align-items:flex-start;gap:14px}
        .stat-icon{width:40px;height:40px;border-radius:var(--r);display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .stat-icon .mi{font-size:20px}
        .stat-label{font-size:11px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
        .stat-value{font-size:26px;font-weight:600;line-height:1.1}
        .stat-sub{font-size:12px;color:var(--txt2);margin-top:4px}
        .charts-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:24px}
        .chart-card{background:var(--surf);border:1px solid var(--bdr);border-radius:var(--rl);padding:20px}
        .chart-title{font-size:11px;font-weight:500;color:var(--txt2);margin-bottom:16px;text-transform:uppercase;letter-spacing:.04em}
        .tbl-card{background:var(--surf);border:1px solid var(--bdr);border-radius:var(--rl);margin-bottom:24px;overflow:hidden}
        .tbl-heading{font-size:11px;font-weight:500;color:var(--txt2);text-transform:uppercase;letter-spacing:.04em;padding:16px 16px 0}
        .tbl{width:100%;border-collapse:collapse;font-size:13.5px}
        .tbl th{padding:10px 16px;text-align:left;font-size:11px;font-weight:500;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--bdr);background:var(--surf2)}
        .tbl td{padding:11px 16px;border-bottom:1px solid var(--bdr);vertical-align:middle}
        .tbl tr:last-child td{border-bottom:none}
        .tbl tbody tr:hover{background:var(--surf2)}
        .fw5{font-weight:500}.muted{color:var(--txt2)}.small{font-size:12px}.mono{font-family:var(--mono);font-size:11px}.trunc{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .empty{text-align:center;color:var(--txt3);padding:40px!important;font-size:13px}
        .badge{font-size:11px;font-weight:500;padding:3px 8px;border-radius:20px;border:1px solid}
        .plan-badge{font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px}
        .sev-pill{font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px}
        .alert-status{font-size:11px;font-weight:500;padding:3px 8px;border-radius:4px}
        .as-open{background:#ef444418;color:#ef4444}.as-acknowledged{background:#f59e0b18;color:#f59e0b}.as-resolved{background:#22c55e18;color:#22c55e}
        .icon-btn{background:none;border:1px solid var(--bdr2);cursor:pointer;color:var(--txt2);padding:6px;border-radius:var(--r);display:flex;align-items:center}
        .icon-btn:hover{background:var(--surf2);color:var(--txt)}
        .xs-btn{font-size:11px;padding:4px 10px;border-radius:4px;border:1px solid;cursor:pointer;font-family:var(--font);font-weight:500}
        .ghost{background:none;border-color:var(--bdr2);color:var(--txt2)}.ghost:hover{background:var(--surf2);color:var(--txt)}
        .danger{background:#ef444411;border-color:#ef444433;color:#ef4444}.danger:hover{background:#ef444422}
        .actions-cell{display:flex;gap:6px}
        .filter-bar{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
        .filter-label{font-size:12px;color:var(--txt3);margin-right:4px}
        .search-in{flex:1;min-width:200px;max-width:280px;background:var(--surf);border:1px solid var(--bdr2);border-radius:var(--r);padding:8px 12px;color:var(--txt);font-size:13px;font-family:var(--font);outline:none}
        .search-in:focus{border-color:var(--accent)}
        .tabs{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
        .tab{font-size:11px;padding:5px 10px;border-radius:4px;border:1px solid var(--bdr);background:none;color:var(--txt2);cursor:pointer;font-family:var(--font)}
        .tab:hover{background:var(--surf2);color:var(--txt)}.tab.active{background:#0ea5e922;border-color:#0ea5e966;color:var(--accent)}
        .error-bar{background:#ef444418;border:1px solid #ef444433;border-radius:var(--r);padding:12px 16px;color:#ef4444;font-size:13px;display:flex;align-items:center;gap:10px;margin-bottom:20px}
        .placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 40px}
        .mi{font-family:'Material Icons';font-weight:normal;font-style:normal;font-size:20px;display:inline-flex;align-items:center;justify-content:center;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased}
        .spin{animation:spin .8s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:3px}
        @media(max-width:768px){.sidebar{position:fixed;z-index:100;height:100vh}.stats-grid{grid-template-columns:1fr 1fr}.charts-row{grid-template-columns:1fr}}
      `}</style>
      <div className="layout">
        <Sidebar active={active} onNav={setActive} collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />
        <div className="main">
          <div className="topbar">
            <span className="topbar-role">Super Admin</span>
            <div className="topbar-user"><div className="avatar">SA</div><span>{adminName}</span></div>
          </div>
          <div className="content">
            {error && (
              <div className="error-bar">
                <span className="mi">error_outline</span>{error} — is the backend running on port 3000?
                <button className="xs-btn ghost" style={{ marginLeft: "auto" }} onClick={fetchAll}>Retry</button>
              </div>
            )}
            {renderPanel()}
          </div>
        </div>
      </div>
    </>
  );
}