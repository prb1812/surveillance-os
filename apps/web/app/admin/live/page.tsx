'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '@/lib/api';

interface StreamInfo {
  cameraId: string;
  cameraName: string;
  hlsUrl: string;
}

function HLSPlayer({ url, name }: { url: string; name: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    }
  }, [url]);

  return (
    <div className="bg-black rounded overflow-hidden relative aspect-video">
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
        {name}
      </div>
    </div>
  );
}

const GRID_OPTIONS = [1, 4, 9, 16];

export default function LiveViewPage() {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [grid, setGrid] = useState(4);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<StreamInfo[]>('/streaming').then((data) => {
      setStreams(data);
      setLoading(false);
    });
  }, []);

  const cols =
    grid === 1 ? 'grid-cols-1' :
    grid === 4 ? 'grid-cols-2' :
    grid === 9 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Live View</h1>
        <div className="flex gap-2">
          {GRID_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => setGrid(g)}
              className={`px-3 py-1 rounded border text-sm ${grid === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
            >
              {g} cam
            </button>
          ))}
        </div>
      </div>
      {loading ? <p>Loading streams...</p> : (
        <div className={`grid ${cols} gap-3`}>
          {streams.slice(0, grid).map((s) => (
            <HLSPlayer key={s.cameraId} url={s.hlsUrl} name={s.cameraName} />
          ))}
        </div>
      )}
    </div>
  );
}
