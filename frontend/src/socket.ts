import { io } from 'socket.io-client';

const getSessionToken = (): string => {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem('number_duel_session_token');
  if (!token) {
    token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('number_duel_session_token', token);
  }
  return token;
};

const BACKEND_URL = 
  import.meta.env.VITE_BACKEND_URL || 
  (typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? `http://${window.location.hostname}:4000`
      : window.location.origin)
    : 'http://localhost:4000');

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket'],
  auth: {
    sessionToken: getSessionToken()
  }
});

