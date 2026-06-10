import { io } from 'socket.io-client';

const BACKEND_URL = 
  import.meta.env.VITE_BACKEND_URL || 
  (typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? `http://${window.location.hostname}:4000`
      : window.location.origin)
    : 'http://localhost:4000');

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket']
});

