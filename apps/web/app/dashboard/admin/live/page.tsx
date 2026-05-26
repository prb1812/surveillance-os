'use client';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';

interface Camera {
  id: string;
  name: string;
  status: string;
  hlsUrl?: string;
  streamUrl?: string;
  location?: string;
  client?: { name: string };
}

function HLSPlayer({ camera, selected, onClick }: { camera: Camera; selected: boolean; onClick: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const url = camera.status === 'ONLINE'
    ? `http://localhost:8888/${camera.id}/index.m3u8`
    : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) { setLoading(false); return; }

    setError(false);
    setLoading(true);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) { setError(true); setLoading(false); }
      });
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.onloadedmetadata = () => { setLoading(false); video.play().catch(() => {}); };
      video.onerror = () => { setError(true); setLoading(false); };
    }
  }, [url]);

  return (
    <div
      onClick={onClick}
      className={`relative bg-black rounded-lg overflow-hidden cursor-pointer aspect-video group
        ${selected ? 'ring-2 ring-cyan-400' : 'ring-1 ring-gray-800 hover:ring-gray-600'}`}
    >
      {url && !error ? (
        <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
          <span className="text-3xl mb-2">{camera.status === 'ONLINE' ? '📹' : '📷'}</span>
          <p className="text-xs">{camera.status === 'ONLINE' ? 'Stream unavailable' : 'Camera offline'}</p>
        </div>
      )}

      {loading && url && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${camera.status === 'ONLINE' ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-xs text-white bg-black/60 px-1.5 py-0.5 rounded font-mono">{camera.status}</span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-white text-xs font-medium truncate">{camera.name}</p>
        {camera.client && <p className="text-gray-400 text-xs truncate">{camera.client.name}</p>}
      </div>

      <button
        onClick={e => { e.stopPropagation(); videoRef.current?.requestFullscreen(); }}
        className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-xs"
      >⛶</button>
    </div>
  );
}

function PTZControls({ cameraId }: { cameraId: string }) {
  const sendPTZ = async (action: string) => {
    try { await api.post(`/cameras/${cameraId}/ptz`, { action }); } catch {}
  };
  const btn = (label: string, action: string, extra = '') => (
    <button onClick={() => sendPTZ(action)} className={`bg-gray-700 hover:bg-gray-600 active:bg-cyan-700 text-white rounded p-2 text-sm font-bold transition-colors ${extra}`}>{label}</button>
  );
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">🕹️ PTZ Controls</h3>
      <div className="grid grid-cols-3 gap-1.5 w-36 mx-auto">
        <div />{btn('▲', 'up')}<div />
        {btn('◀', 'left')}{btn('⏺', 'home', 'bg-gray-600')}{btn('▶', 'right')}
        <div />{btn('▼', 'down')}<div />
      </div>
      <div className="flex gap-1.5 mt-2 justify-center">
        {btn('🔍+', 'zoom_in', 'text-xs px-3')}
        {btn('🔍-', 'zoom_out', 'text-xs px-3')}
      </div>
    </div>
  );
}

const GRID_OPTIONS = [
  { label: '1', cols: 'grid-cols-1', count: 1 },
  { label: '4', cols: 'grid-cols-2', count: 4 },
  { label: '9', cols: 'grid-cols-3', count: 9 },
  { label: '16', cols: 'grid-cols-4', count: 16 },
];

export default function LiveViewPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState(1);
  const [selected, setSelected] = useState<Camera | null>(null);
  const [showPTZ, setShowPTZ] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get<Camera[]>('/cameras').then(data => {
      setCameras(data);
      const first = data.find(c => c.status === 'ONLINE');
      if (first) setSelected(first);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const currentCols = GRID_OPTIONS.find(g => g.count === grid)?.cols || 'grid-cols-1';
  const visibleCameras = cameras.slice(0, grid);
  const onlineCameras = cameras.filter(c => c.status === 'ONLINE');

  const takeSnapshot = () => {
    const video = document.querySelector('video');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const a = document.createElement('a');
    a.download = `snapshot-${selected?.name}-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold">Live View</h1>
          <p className="text-gray-400 text-xs mt-0.5">{onlineCameras.length} of {cameras.length} cameras online</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
            {GRID_OPTIONS.map(g => (
              <button key={g.count} onClick={() => setGrid(g.count)}
                className={`px-3 py-1 rounded text-sm font-mono transition-colors ${grid === g.count ? 'bg-cyan-400 text-gray-950 font-bold' : 'text-gray-400 hover:text-white'}`}>
                {g.label}
              </button>
            ))}
          </div>
          {selected && (
            <>
              <button onClick={takeSnapshot} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-sm border border-gray-700">📸 Snapshot</button>
              <button onClick={() => setAiEnabled(p => ({ ...p, [selected.id]: !p[selected.id] }))}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${aiEnabled[selected.id] ? 'bg-cyan-400/20 text-cyan-400 border-cyan-400/40' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                🤖 AI {aiEnabled[selected.id] ? 'ON' : 'OFF'}
              </button>
              <button onClick={() => setShowPTZ(!showPTZ)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${showPTZ ? 'bg-purple-400/20 text-purple-400 border-purple-400/40' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                🕹️ PTZ
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className={`grid ${currentCols} gap-2`}>
              {visibleCameras.map(cam => (
                <HLSPlayer key={cam.id} camera={cam} selected={selected?.id === cam.id} onClick={() => setSelected(cam)} />
              ))}
              {Array.from({ length: Math.max(0, grid - visibleCameras.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-video bg-gray-900 border border-gray-800 border-dashed rounded-lg flex items-center justify-center">
                  <p className="text-gray-700 text-xs">No camera</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {showPTZ && selected && (
          <div className="w-48 flex-shrink-0 space-y-3">
            <PTZControls cameraId={selected.id} />
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs space-y-2">
              <p className="text-gray-400 font-semibold uppercase tracking-wide">Selected</p>
              <p className="text-white font-medium">{selected.name}</p>
              {selected.client && <p className="text-gray-500">{selected.client.name}</p>}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${selected.status === 'ONLINE' ? 'bg-green-400' : 'bg-red-500'}`} />
                <span className={selected.status === 'ONLINE' ? 'text-green-400' : 'text-red-400'}>{selected.status}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400">All Cameras</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {cameras.map(cam => (
            <div key={cam.id} onClick={() => setSelected(cam)}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-800/50 transition-colors ${selected?.id === cam.id ? 'bg-cyan-400/5 border-l-2 border-cyan-400' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cam.status === 'ONLINE' ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
                <div>
                  <p className="text-sm font-medium">{cam.name}</p>
                  {cam.client && <p className="text-xs text-gray-500">{cam.client.name}</p>}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${cam.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cam.status}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
