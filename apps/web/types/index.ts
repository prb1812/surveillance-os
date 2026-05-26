export interface User {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'OPERATOR' | 'CUSTOMER';
  clientId?: string;
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  status: 'ONLINE' | 'OFFLINE' | 'RECORDING' | 'ERROR';
  rtspUrl: string;
  hlsPath?: string;
  clientId: string;
  client?: { id: string; name: string };
  streamUrl?: string;
  hlsUrl?: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string;
  snapshotUrl?: string;
  cameraId: string;
  clientId: string;
  camera?: { id: string; name: string };
  client?: { id: string; name: string };
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
  isActive: boolean;
  _count?: {
    cameras: number;
    users: number;
    alerts: number;
  };
}

export interface Recording {
  id: string;
  cameraId: string;
  startTime: string;
  endTime: string;
  duration: number;
  storageKey: string;
  fileSize: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}