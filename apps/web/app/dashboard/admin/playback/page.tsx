'use client';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminNavItems } from '@/lib/nav-items';

interface Camera { id: string; name: string; status: string; client?: { name: string }; }
interface Recording { id: string; startTime: string; endTime: string; duration: number; size: number; url?: string; }
interface TimelineBlock { hour: number; hasRecording: boolean; recordingId?: string; }

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function VideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    } else {
      video.src = url;
    }
  }, [url]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  return (
    <div className="bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        className="w-full aspect-video"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        controls
      />
    </div>
  );
}

export default function PlaybackPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineBlock[]>([]);

  useEffect(() => {
    api.get<Camera[]>('/cameras').then(data => {
      setCameras(data);
      const first = data.find(c => c.status === 'ONLINE') || data[0];
      if (first) setSelectedCamera(first);
    });
  }, []);

  useEffect(() => {
    if (!selectedCamera) return;
    loadRecordings();
  }, [selectedCamera, selectedDate]);

  const loadRecordings = async () => {
    if (!selectedCamera) return;
    setLoading(true);
    setSelectedRecording(null);
    try {
      const [recs, tl] = await Promise.all([
        api.get<Recording[]>(`/recording/${selectedCamera.id}`),
        api.get<any>(`/recording/${selectedCamera.id}/timeline?date=${selectedDate}`),
      ]);
      setRecordings(Array.isArray(recs) ? recs : []);

      // Build 24-hour timeline
      const blocks: TimelineBlock[] = Array.from({ length: 24 }, (_, hour) => {
        const tlArray = Array.isArray(tl) ? tl : [];
        const match = tlArray.find((t: any) => new Date(t.startTime).getHours() === hour);
        return { hour, hasRecording: !!match, recordingId: match?.id };
      });
      setTimeline(blocks);
    } catch { setRecordings([]); setTimeline(Array.from({ length: 24 }, (_, hour) => ({ hour, hasRecording: false }))); }
    finally { setLoading(false); }
  };

  const downloadRecording = async (rec: Recording) => {
    if (!rec.url) return;
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = `recording-${rec.id}.mp4`;
    a.click();
  };

  const deleteRecording = async (id: string) => {
    if (!confirm('Delete this recording?')) return;
    // await api.delete(`/recording/${id}`);
    setRecordings(prev => prev.filter(r => r.id !== id));
    if (selectedRecording?.id === id) setSelectedRecording(null);
  };

  return (
    <DashboardLayout navItems={adminNavItems} role="SUPER_ADMIN">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Playback & Recordings</h1>
        <p className="text-gray-400 text-sm mt-1">Review and download recorded footage</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel — Camera + Date selector */}
        <div className="space-y-4">
          {/* Camera selector */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Select Camera</h2>
            <div className="space-y-1">
              {cameras.map(cam => (
                <button
                  key={cam.id}
                  onClick={() => setSelectedCamera(cam)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${selectedCamera?.id === cam.id ? 'bg-cyan-400/10 border border-cyan-400/20 text-cyan-400' : 'hover:bg-gray-800 text-gray-300'}`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cam.status === 'ONLINE' ? 'bg-green-400' : 'bg-red-500'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{cam.name}</p>
                    {cam.client && <p className="text-xs text-gray-500 truncate">{cam.client.name}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Select Date</h2>
            <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded focus:border-cyan-400 focus:outline-none"
            />
            {/* Quick date buttons */}
            <div className="flex gap-2 mt-2">
              {['Today', 'Yesterday'].map((label, i) => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const val = d.toISOString().split('T')[0];
                return (
                  <button key={label} onClick={() => setSelectedDate(val)}
                    className={`flex-1 py-1 rounded text-xs border transition-colors ${selectedDate === val ? 'bg-cyan-400/20 text-cyan-400 border-cyan-400/40' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recording list */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Recordings {recordings.length > 0 && <span className="text-cyan-400">({recordings.length})</span>}
            </h2>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-3xl mb-2">🎬</p>
                <p className="text-gray-500 text-sm">No recordings for this date</p>
                <p className="text-gray-600 text-xs mt-1">Start a recording from Live View</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recordings.map(rec => (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecording(rec)}
                    className={`p-3 rounded-lg cursor-pointer border transition-colors ${selectedRecording?.id === rec.id ? 'bg-cyan-400/10 border-cyan-400/20' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-medium text-white">
                        {new Date(rec.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {new Date(rec.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>⏱ {formatDuration(rec.duration)}</span>
                      <span>💾 {formatSize(rec.size)}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={e => { e.stopPropagation(); downloadRecording(rec); }}
                        className="flex-1 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-white">
                        ⬇ Download
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteRecording(rec.id); }}
                        className="py-1 px-2 rounded text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400">
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Video player + Timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video player */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {selectedRecording?.url ? (
              <VideoPlayer url={selectedRecording.url} />
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center text-gray-600">
                <p className="text-5xl mb-3">⏪</p>
                <p className="text-gray-400 font-medium">Select a recording to play</p>
                <p className="text-gray-600 text-sm mt-1">
                  {selectedCamera ? `${selectedCamera.name} — ${selectedDate}` : 'Choose a camera and date'}
                </p>
              </div>
            )}
          </div>

          {/* 24-hour Timeline */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">24-Hour Timeline</h2>
              <p className="text-xs text-gray-500">{selectedDate}</p>
            </div>
            <div className="relative">
              {/* Hour blocks */}
              <div className="flex gap-0.5 h-10">
                {timeline.map(block => (
                  <div
                    key={block.hour}
                    title={`${block.hour}:00 — ${block.hasRecording ? 'Recording available' : 'No recording'}`}
                    onClick={() => {
                      if (block.hasRecording && block.recordingId) {
                        const rec = recordings.find(r => r.id === block.recordingId);
                        if (rec) setSelectedRecording(rec);
                      }
                    }}
                    className={`flex-1 rounded-sm transition-colors ${
                      block.hasRecording
                        ? 'bg-cyan-400/70 hover:bg-cyan-400 cursor-pointer'
                        : 'bg-gray-800'
                    }`}
                  />
                ))}
              </div>
              {/* Hour labels */}
              <div className="flex mt-1">
                {[0, 6, 12, 18, 23].map(h => (
                  <div key={h} className="text-xs text-gray-600 font-mono" style={{ position: 'absolute', left: `${(h / 24) * 100}%` }}>
                    {h.toString().padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              <div className="h-4" />
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-cyan-400/70" />
                <span>Recording available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-gray-800" />
                <span>No recording</span>
              </div>
            </div>
          </div>

          {/* Selected recording details */}
          {selectedRecording && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Recording Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Start', value: new Date(selectedRecording.startTime).toLocaleTimeString() },
                  { label: 'End', value: new Date(selectedRecording.endTime).toLocaleTimeString() },
                  { label: 'Duration', value: formatDuration(selectedRecording.duration) },
                  { label: 'Size', value: formatSize(selectedRecording.size) },
                ].map(item => (
                  <div key={item.label} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-500 text-xs">{item.label}</p>
                    <p className="text-white font-medium mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
