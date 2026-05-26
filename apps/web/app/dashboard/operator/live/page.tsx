'use client';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { operatorNavItems } from '@/lib/nav-items';

interface Camera { id: string; name: string; status: string; client?: { name: string }; }

function HLSPlayer({ camera, selected, onClick }: { camera: Camera; selected: boolean; onClick: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = camera.status === 'ONLINE' ? `http://localhost:8888/${camera.id}/index.m3u8` : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) { setLoading(false); return; }
    setError(false); setLoading(true);
    if (Hls.isSupported()) {
      const hls = new Hls({ xhrSetup: (xhr) => { xhr.withCredentials = true; } });
      hls.loadSource(url); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setLoading(false); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { setError(true); setLoading(false); } });
      return () => hls.destroy();
    }
  }, [url]);

  return (
    <div onClick={onClick} className={`relative bg-black rounded-lg overflow-hidden cursor-pointer aspect-video group ${selected ? 'ring-2 ring-purple-400' : 'ring-1 ring-gray-800'}`}>
      {url && !error ? <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" /> :
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
          <span className="text-3xl mb-2">📷</span>
          <p className="text-xs">{camera.status === 'ONLINE' ? 'Stream unavailable' : 'Camera offline'}</p>
        </div>}
      {loading && url && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div>}
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${camera.status === 'ONLINE' ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-white text-xs font-medium truncate">{camera.name}</p>
      </div>
      <button onClick={e => { e.stopPropagation(); videoRef.current?.requestFullscreen(); }} className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded opacity-0 group-hover:opacity-100 text-xs">⛶</button>
    </div>
  );
}

export default function OperatorLivePage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selected, setSelected] = useState<Camera | null>(null);
  const [grid, setGrid] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Camera[]>('/cameras').then(data => {
      setCameras(data);
      const first = data.find(c => c.status === 'ONLINE');
      if (first) setSelected(first);
      setLoading(false);
    });
  }, []);

  const cols = grid === 1 ? 'grid-cols-1' : grid === 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <DashboardLayout navItems={operatorNavItems} role="OPERATOR">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Live View</h1>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {[1, 4, 9].map(g => (
            <button key={g} onClick={() => setGrid(g)} className={`px-3 py-1 rounded text-sm font-mono ${grid === g ? 'bg-purple-400 text-gray-950 font-bold' : 'text-gray-400 hover:text-white'}`}>{g}</button>
          ))}
        </div>
      </div>
      {loading ? <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className={`grid ${cols} gap-2`}>
          {cameras.slice(0, grid).map(cam => (
            <HLSPlayer key={cam.id} camera={cam} selected={selected?.id === cam.id} onClick={() => setSelected(cam)} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
