import { useEffect, useState } from 'react';

import { socket } from './socket';
import { Numpad } from './components/Numpad';
import {
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Users,
  Lock,
  Play,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface Player {
  id: string;
  name: string;
  ready: boolean;
  secret?: number | null;
}

interface Guess {
  guess: number;
  hint: 'higher' | 'lower' | 'correct';
  timestamp: number;
}

type GameScreen = 'HOME' | 'WAITING' | 'SECRET' | 'COIN_TOSS' | 'GAME' | 'RESULT';

export default function App() {
  // Navigation & Connection
  const [screen, setScreen] = useState<GameScreen>('HOME');

  // Room State
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);

  // Gameplay State
  const [localSecret, setLocalSecret] = useState<number | null>(null);
  const [myGuesses, setMyGuesses] = useState<Guess[]>([]);
  const [opponentGuessCount, setOpponentGuessCount] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [forfeit, setForfeit] = useState(false);

  // Inputs & Indicators
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [isSecretLocked, setIsSecretLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioEnabled = true;

  // Rematch state
  const [rematchRequestedByMe, setRematchRequestedByMe] = useState(false);
  const [rematchRequestedByOpponent, setRematchRequestedByOpponent] = useState(false);





  // Audio Player Helper (Cute synth notes for pink theme)
  const playBeep = (freq: number, type: OscillatorType = 'sine', duration: number = 0.1) => {
    if (!audioEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = type;
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio context blocked or unsupported', e);
    }
  };

  // Setup Socket Listeners
  useEffect(() => {
    function onConnect() {
      // Connection established
    }

    function onDisconnect() {
      setScreen('HOME');
      resetGameState();
      showError('Disconnected from host server.');
    }

    function onRoomCreated(payload: { roomCode: string; players: Player[] }) {
      playBeep(523.25, 'sine', 0.15); // Cute High C note
      setRoomCode(payload.roomCode);
      setPlayers(payload.players);
      setScreen('WAITING');
    }

    function onPlayerJoined(payload: { roomCode: string; players: Player[] }) {
      playBeep(587.33, 'sine', 0.12); // D note
      setRoomCode(payload.roomCode);
      setPlayers(payload.players);
      if (screen === 'HOME') {
        setScreen('WAITING');
      }
    }

    function onBothReady() {
      playBeep(659.25, 'sine', 0.18); // E note
      setScreen('SECRET');
    }

    function onSecretLocked() {
      playBeep(440, 'sine', 0.1); // A note
      setIsSecretLocked(true);
    }

    function onGameStarted(payload: { currentTurn: string; players: Player[]; coinTossWinnerId: string }) {
      playBeep(783.99, 'sine', 0.22); // G note
      setPlayers(payload.players);
      setCurrentTurn(payload.currentTurn);
      setScreen('GAME');
    }

    function onTurnChanged(payload: { currentTurn: string }) {
      setCurrentTurn(payload.currentTurn);
      if (payload.currentTurn === socket.id) {
        playBeep(698.46, 'sine', 0.1); // F note
      }
    }

    function onGuessResult(payload: { playerId: string; guess: number; hint: 'higher' | 'lower' | 'correct'; history: Guess[] }) {
      if (payload.playerId === socket.id) {
        setMyGuesses(payload.history);
        if (payload.hint === 'higher') playBeep(880, 'sine', 0.12); // High A
        else if (payload.hint === 'lower') playBeep(330, 'sine', 0.12); // Low E
        else playBeep(987.77, 'sine', 0.3); // High B
      } else {
        setOpponentGuessCount(payload.history.length);
        playBeep(440, 'sine', 0.08);
      }
    }

    function onGameOver(payload: { winnerId: string; players: Player[]; forfeit?: boolean }) {
      setWinnerId(payload.winnerId);
      setPlayers(payload.players);
      if (payload.forfeit) {
        setForfeit(true);
      }
      setScreen('RESULT');

      // Trigger Confetti on Win!
      if (payload.winnerId === socket.id && !payload.forfeit) {
        confetti({
          particleCount: 120,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#EC4899', '#F472B6', '#FFF5F5', '#FCE7F3']
        });
      }
    }

    function onRematchRequested() {
      setRematchRequestedByOpponent(true);
      playBeep(523.25, 'sine', 0.1);
    }

    function onRematchStarted() {
      playBeep(783.99, 'sine', 0.2);
      resetRoundState();
      setScreen('SECRET');
    }

    function onPlayerLeft(payload: { playerId: string; playerName: string }) {
      showError(`${payload.playerName} left the room.`);
      if (screen === 'WAITING') {
        setPlayers(prev => prev.filter(p => p.id !== payload.playerId));
      }
    }

    function onErrorMessage(payload: { message: string }) {
      showError(payload.message);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room-created', onRoomCreated);
    socket.on('player-joined', onPlayerJoined);
    socket.on('both-ready', onBothReady);
    socket.on('secret-locked', onSecretLocked);
    socket.on('game-started', onGameStarted);
    socket.on('turn-changed', onTurnChanged);
    socket.on('guess-result', onGuessResult);
    socket.on('game-over', onGameOver);
    socket.on('rematch-requested', onRematchRequested);
    socket.on('rematch-started', onRematchStarted);
    socket.on('player-left', onPlayerLeft);
    socket.on('error-message', onErrorMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room-created', onRoomCreated);
      socket.off('player-joined', onPlayerJoined);
      socket.off('both-ready', onBothReady);
      socket.off('secret-locked', onSecretLocked);
      socket.off('game-started', onGameStarted);
      socket.off('turn-changed', onTurnChanged);
      socket.off('guess-result', onGuessResult);
      socket.off('game-over', onGameOver);
      socket.off('rematch-requested', onRematchRequested);
      socket.off('rematch-started', onRematchStarted);
      socket.off('player-left', onPlayerLeft);
      socket.off('error-message', onErrorMessage);
    };
  }, [screen, audioEnabled]);

  // State Management Actions
  const resetGameState = () => {
    setRoomCode('');
    setPlayers([]);
    setCurrentTurn(null);
    setLocalSecret(null);
    setMyGuesses([]);
    setOpponentGuessCount(0);
    setWinnerId(null);
    setForfeit(false);
    setJoinCodeInput('');
    setSecretInput('');
    setGuessInput('');
    setIsSecretLocked(false);
    setRematchRequestedByMe(false);
    setRematchRequestedByOpponent(false);
  };

  const resetRoundState = () => {
    setCurrentTurn(null);
    setLocalSecret(null);
    setMyGuesses([]);
    setOpponentGuessCount(0);
    setWinnerId(null);
    setForfeit(false);
    setSecretInput('');
    setGuessInput('');
    setIsSecretLocked(false);
    setRematchRequestedByMe(false);
    setRematchRequestedByOpponent(false);
  };

  const showError = (msg: string) => {
    playBeep(220, 'sine', 0.25);
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage(null);
    }, 4000);
  };

  // Button Action Handlers
  const handleCreateRoom = () => {
    socket.emit('create-room');
  };

  const handleJoinRoom = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!joinCodeInput || joinCodeInput.length !== 4) {
      showError('Room Code must be 4 letters.');
      return;
    }
    socket.emit('join-room', { roomCode: joinCodeInput });
  };

  const handleReady = () => {
    playBeep(440, 'sine', 0.08);
    socket.emit('player-ready');
  };

  const handleLockSecret = () => {
    const val = parseInt(secretInput);
    if (isNaN(val) || val < 0 || val > 9999) {
      showError('Choose a number between 0000 and 9999.');
      return;
    }
    setLocalSecret(val);
    socket.emit('set-secret', { number: val });
  };

  const handleSubmitGuess = () => {
    const val = parseInt(guessInput);
    if (isNaN(val) || val < 0 || val > 9999) {
      showError('Guess must be between 0000 and 9999.');
      return;
    }
    socket.emit('submit-guess', { guess: val });
    setGuessInput('');
  };

  const handleRequestRematch = () => {
    playBeep(523, 'sine', 0.1);
    setRematchRequestedByMe(true);
    socket.emit('request-rematch');
  };

  const handleLeaveRoom = () => {
    playBeep(330, 'sine', 0.1);
    socket.emit('leave-room');
    resetGameState();
    setScreen('HOME');
  };

  const copyRoomCode = () => {
    playBeep(659, 'sine', 0.05);
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };



  // Computations
  const localPlayer = players.find(p => p.id === socket.id);
  const opponentPlayer = players.find(p => p.id !== socket.id);
  const isMyTurn = currentTurn === socket.id;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between select-none">
      
      {/* 1. App Header */}
      <header className="bg-white/80 backdrop-blur-md px-5 py-4 flex justify-between items-center shadow-sm shadow-pink-100/30 border-b border-pink-50 sticky top-0 z-20">
        <div className="flex items-center space-x-1.5">
          <span className="text-xl">🎯</span>
          <h1 className="font-bold text-lg text-gray-800 tracking-tight">
            Number Duel
          </h1>
        </div>
        <a 
          href="https://0xclub.in" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-xs font-bold text-pink-500 hover:text-pink-600 transition-colors font-mono"
        >
          by 0xclub.in
        </a>
      </header>

      {/* 2. Global Error Overlay */}
      {errorMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-xs px-4 z-50 animate-scale-up">
          <div className="bg-white border border-rose-100 text-rose-600 p-4 rounded-3xl flex items-start space-x-2.5 shadow-xl shadow-rose-100/50">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <p className="font-sans text-xs font-bold text-rose-500 uppercase tracking-wide">Notice</p>
              <p className="font-sans text-sm leading-tight text-gray-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Screen Viewport */}
      <main className="flex-grow flex flex-col justify-center items-center p-5 max-w-md w-full mx-auto">
        
        {/* ==================== HOME SCREEN ==================== */}
        {screen === 'HOME' && (
          <div className="w-full bg-white rounded-3xl p-6 shadow-xl shadow-pink-100/60 border border-pink-50/50 space-y-7 animate-scale-up text-center">
            <div className="space-y-2 py-2">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-pink-100 rounded-3xl text-3xl shadow-inner shadow-pink-200">
                🎯
              </div>
              <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">
                Number Duel
              </h2>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                A friendly, real-time number guessing duel. Outsmart your friend by cracking their code first!
              </p>
            </div>

            <div className="space-y-3.5">
              <button
                onClick={handleCreateRoom}
                className="w-full bg-pink-500 text-white py-4 rounded-2xl font-bold hover:bg-pink-600 active:scale-[0.98] transition-all shadow-md shadow-pink-100 flex justify-center items-center space-x-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Create a Room</span>
              </button>


            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-pink-100"></div>
              <span className="flex-shrink mx-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Or Join Room</span>
              <div className="flex-grow border-t border-pink-100"></div>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="space-y-1.5">
                <input
                  type="text"
                  maxLength={4}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter 4-Letter Code"
                  className="w-full bg-pink-50/40 text-pink-600 border border-pink-100 focus:border-pink-300 p-4 font-mono text-center font-bold tracking-widest text-2xl placeholder-gray-300 uppercase focus:outline-none rounded-2xl transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={joinCodeInput.length !== 4}
                className={`w-full py-4 rounded-2xl font-bold transition-all flex justify-center items-center space-x-2
                  ${joinCodeInput.length === 4
                    ? 'bg-gray-800 text-white hover:bg-gray-900 active:scale-[0.98]'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }
                `}
              >
                <Play className="w-4 h-4" />
                <span>Join Room</span>
              </button>
            </form>
          </div>
        )}

        {/* ==================== WAITING ROOM SCREEN ==================== */}
        {screen === 'WAITING' && (
          <div className="w-full bg-white rounded-3xl p-6 shadow-xl shadow-pink-100/60 border border-pink-50/50 space-y-6 animate-scale-up">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-extrabold text-gray-800 tracking-tight">Lobby Waiting Room</h2>
              <p className="text-xs text-gray-400">Share code with a friend to begin</p>
            </div>

            {/* Room code banner */}
            <div className="bg-pink-50/50 border border-pink-100 p-4 rounded-2xl text-center space-y-1.5">
              <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold block">
                Room Code
              </span>
              <div className="flex justify-center items-center space-x-2">
                <span className="font-mono text-3xl font-black text-pink-600 tracking-widest px-3 py-1">
                  {roomCode}
                </span>
                <button
                  onClick={copyRoomCode}
                  className="p-2 rounded-xl border border-pink-200 bg-white text-pink-500 hover:bg-pink-50 active:scale-95 transition-all"
                  title="Copy code"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Connections */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 tracking-wider uppercase flex items-center">
                <Users className="w-4 h-4 mr-1.5 text-pink-400" /> Players ({players.length}/2)
              </h3>
              
              <div className="space-y-2.5">
                {localPlayer && (
                  <div className="flex justify-between items-center p-3.5 rounded-2xl border border-pink-100/50 bg-white shadow-sm">
                    <div className="text-sm font-bold text-gray-700 flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-pink-400 mr-2" />
                      {localPlayer.name} <span className="text-[10px] text-gray-400 ml-1 font-normal">(You)</span>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      localPlayer.ready 
                        ? 'border-pink-200 text-pink-600 bg-pink-50/50' 
                        : 'border-gray-200 text-gray-400 bg-gray-50/30'
                    }`}>
                      {localPlayer.ready ? 'Ready' : 'Not Ready'}
                    </span>
                  </div>
                )}

                {opponentPlayer ? (
                  <div className="flex justify-between items-center p-3.5 rounded-2xl border border-pink-100/50 bg-white shadow-sm">
                    <div className="text-sm font-bold text-gray-700 flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-pink-300 mr-2" />
                      {opponentPlayer.name}
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      opponentPlayer.ready 
                        ? 'border-pink-200 text-pink-600 bg-pink-50/50' 
                        : 'border-gray-200 text-gray-400 bg-gray-50/30'
                    }`}>
                      {opponentPlayer.ready ? 'Ready' : 'Not Ready'}
                    </span>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-dashed border-pink-200 bg-pink-50/10 flex items-center justify-center text-xs text-gray-400 tracking-wide font-medium animate-pulse">
                    Waiting for second player to connect...
                  </div>
                )}
              </div>
            </div>

            {/* Action Toggles */}
            {localPlayer && (
              <button
                disabled={players.length < 2 || localPlayer.ready}
                onClick={handleReady}
                className={`w-full py-4 rounded-2xl font-bold tracking-wide transition-all border
                  ${players.length < 2 
                    ? 'bg-gray-50 text-gray-300 border-gray-150 cursor-not-allowed'
                    : localPlayer.ready
                      ? 'bg-pink-50 text-pink-400 border-pink-100 animate-pulse cursor-not-allowed'
                      : 'bg-pink-500 text-white border-pink-500 hover:bg-pink-600 active:scale-[0.98] shadow-md shadow-pink-150'
                  }
                `}
              >
                {localPlayer.ready ? 'Waiting for opponent...' : "I'm Ready!"}
              </button>
            )}

            <button
              onClick={handleLeaveRoom}
              className="w-full bg-white text-gray-500 hover:bg-gray-50 py-3 rounded-2xl font-bold text-xs transition-colors border border-gray-200 flex justify-center items-center space-x-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          </div>
        )}

        {/* ==================== SECRET ENTRY SCREEN ==================== */}
        {screen === 'SECRET' && (
          <div className="w-full bg-white rounded-3xl p-6 shadow-xl shadow-pink-100/60 border border-pink-50/50 space-y-6 animate-scale-up">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-extrabold text-gray-800 tracking-tight">Set Secret Number</h2>
              <p className="text-xs text-gray-400">Choose a 4-digit code that your opponent will try to guess.</p>
            </div>

            <div className="text-center space-y-3">
              <div className="flex justify-center space-x-3 font-mono">
                {/* 4 Digit Displays */}
                {[0, 1, 2, 3].map((idx) => {
                  const digit = secretInput[idx] || '';
                  return (
                    <div
                      key={idx}
                      className={`w-12 h-14 border-2 flex items-center justify-center text-3xl font-black rounded-xl transition-all
                        ${isSecretLocked 
                          ? 'border-pink-300 text-pink-400 bg-pink-50/30' 
                          : digit 
                            ? 'border-pink-400 text-pink-500 bg-pink-50/10' 
                            : 'border-pink-100 text-pink-300 bg-pink-50/5'
                        }
                      `}
                    >
                      {isSecretLocked ? '•' : digit}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-gray-400 max-w-xs mx-auto leading-tight">
                Your code must be between 0000 and 9999.
              </p>
            </div>

            {/* Custom numpad */}
            <Numpad
              value={secretInput}
              onChange={setSecretInput}
              disabled={isSecretLocked}
              maxLength={4}
              onSubmit={handleLockSecret}
              submitLabel="Lock Secret Number"
            />

            {isSecretLocked && (
              <div className="border border-pink-100 bg-pink-50/30 rounded-2xl p-3.5 flex items-center justify-center space-x-2 text-pink-500 animate-pulse text-xs font-semibold tracking-wide uppercase">
                <Lock className="w-4 h-4" />
                <span>Code locked. Waiting for opponent...</span>
              </div>
            )}
          </div>
        )}

        {/* ==================== GAME SCREEN ==================== */}
        {screen === 'GAME' && (
          <div className="w-full flex flex-col space-y-4 animate-scale-up">
            
            {/* Active Turn Alert Bar */}
            <div className={`border text-center p-3 font-sans font-bold rounded-2xl text-sm transition-all shadow-sm
              ${isMyTurn
                ? 'border-pink-200 bg-pink-500 text-white shadow-pink-100/50 active:scale-95'
                : 'border-gray-200 bg-white text-gray-400'
              }
            `}>
              {isMyTurn 
                ? "It's Your Turn! 🌸" 
                : "Waiting for Opponent's Guess... ⏳"
              }
            </div>

            {/* Split grids */}
            <div className="grid grid-cols-1 gap-4">
              
              {/* Dialer Board Card (Now on Top) */}
              <div className="bg-white rounded-3xl p-5 border border-pink-50/60 shadow-lg shadow-pink-100/30 space-y-4">
                <div className="text-center">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                    Make a Guess
                  </span>
                  
                  {/* Guess display */}
                  <div className="flex justify-center space-x-2">
                    {[0, 1, 2, 3].map((idx) => {
                      const digit = guessInput[idx] || '';
                      return (
                        <div
                          key={idx}
                          className={`w-9 h-11 border-2 flex items-center justify-center font-mono text-xl font-bold rounded-xl
                            ${!isMyTurn 
                              ? 'border-gray-100 text-gray-300 bg-gray-50/20' 
                              : digit 
                                ? 'border-pink-400 text-pink-500 bg-pink-50/10' 
                                : 'border-pink-150 text-pink-300 bg-pink-50/5'
                            }
                          `}
                        >
                          {digit}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Keyboard dialer */}
                <Numpad
                  value={guessInput}
                  onChange={setGuessInput}
                  disabled={!isMyTurn}
                  maxLength={4}
                  onSubmit={handleSubmitGuess}
                  submitLabel="Submit Guess"
                />

                {!isMyTurn && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-center text-xs text-gray-400">
                    Opponent is thinking...
                  </div>
                )}

                {/* Local user secret reference */}
                <div className="bg-pink-50/30 border border-pink-100 rounded-xl p-2 text-center text-xs text-gray-500">
                  Your Secret Number: <strong className="text-pink-500 font-bold text-sm tracking-widest font-mono ml-1">{localSecret !== null && localSecret !== undefined ? String(localSecret).padStart(4, '0') : ''}</strong>
                </div>
              </div>

              {/* Guess Logs card (Now on Bottom) */}
              <div className="bg-white rounded-3xl p-5 border border-pink-50/60 shadow-lg shadow-pink-100/30 flex flex-col justify-between h-[250px] md:h-[280px]">
                <div className="space-y-2.5 flex-grow flex flex-col overflow-hidden">
                  <div className="border-b border-pink-50 pb-2 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Your Guess History
                    </span>
                    <span className="text-[10px] bg-pink-50 text-pink-500 border border-pink-100 px-2.5 py-0.5 rounded-full font-bold">
                      {myGuesses.length} Guesses
                    </span>
                  </div>

                  {/* Scrollable list */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-sm font-sans">
                    {myGuesses.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-gray-300 tracking-wide text-center">
                        No guesses logged yet
                      </div>
                    ) : (
                      [...myGuesses].reverse().map((g, i) => {
                        const originalIndex = myGuesses.length - i;
                        const hintBadge = 
                          g.hint === 'higher' ? 'bg-blue-50 border border-blue-100 text-blue-500' :
                          g.hint === 'lower' ? 'bg-red-50 border border-red-100 text-red-500' :
                          'bg-green-50 border border-green-100 text-green-600 font-bold';

                        return (
                          <div 
                            key={originalIndex} 
                            className="flex justify-between items-center p-2.5 rounded-xl border border-pink-50 bg-white animate-scale-up"
                          >
                            <span className="text-gray-500 text-xs">
                              Guess #{originalIndex}: <strong className="text-gray-700 text-sm font-mono ml-1">{String(g.guess).padStart(4, '0')}</strong>
                            </span>
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase ${hintBadge}`}>
                              {g.hint}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Opponent attempts */}
                <div className="border-t border-pink-50 pt-2 flex justify-between items-center text-xs text-gray-400">
                  <span>Opponent attempts:</span>
                  <span className="font-bold text-gray-600 bg-pink-50 px-2 py-0.5 rounded-full">
                    {opponentGuessCount} guesses
                  </span>
                </div>
              </div>

            </div>


            {/* Leave match button */}
            <button
              onClick={handleLeaveRoom}
              className="mx-auto w-fit text-red-400 hover:text-red-500 text-xs font-semibold underline decoration-red-200 hover:decoration-red-400 transition-colors"
            >
              Quit Game
            </button>
          </div>
        )}

        {/* ==================== RESULT SCREEN ==================== */}
        {screen === 'RESULT' && (
          <div className="w-full bg-white rounded-3xl p-6 shadow-xl shadow-pink-100/60 border border-pink-50/50 space-y-6 animate-scale-up text-center">
            
            {/* Victory / Defeat Display */}
            <div className="space-y-1.5">
              <div className="text-4xl">
                {winnerId === socket.id ? '🎉' : '💔'}
              </div>
              {winnerId === socket.id ? (
                <div>
                  <h2 className="text-2xl font-black text-pink-600">
                    You Won!
                  </h2>
                  <p className="text-xs text-gray-400">
                    You guessed the opponent's number!
                  </p>
                </div>
              ) : (
                <div>
                  <h2 className="text-2xl font-black text-gray-800">
                    You Lost!
                  </h2>
                  <p className="text-xs text-gray-400">
                    The opponent guessed your number first.
                  </p>
                </div>
              )}
            </div>

            {/* Match summary table */}
            <div className="border border-pink-100 bg-pink-50/20 p-4 rounded-2xl space-y-2.5 text-sm">
              <div className="flex justify-between items-center border-b border-pink-100/50 pb-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Player</span>
                <span>Secret Code</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Your Secret:</span>
                <span className="text-pink-600 font-mono font-bold tracking-widest text-base">
                  {localSecret !== null && localSecret !== undefined ? String(localSecret).padStart(4, '0') : ''}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium">Opponent's Secret:</span>
                <span className="text-pink-600 font-mono font-bold tracking-widest text-base">
                  {opponentPlayer?.secret !== null && opponentPlayer?.secret !== undefined ? String(opponentPlayer.secret).padStart(4, '0') : '????'}
                </span>
              </div>

              <div className="border-t border-pink-100/50 pt-2 flex justify-between text-xs text-gray-400 font-medium">
                <span>Total Guesses:</span>
                <span className="font-bold text-gray-700">{myGuesses.length} attempts</span>
              </div>
            </div>

            {forfeit && (
              <div className="border border-red-200 bg-red-50 text-red-500 rounded-xl p-2.5 text-xs font-bold">
                Opponent left the game.
              </div>
            )}

            {/* Rematch actions */}
            <div className="space-y-3">
              {rematchRequestedByOpponent && !rematchRequestedByMe && (
                <div className="bg-pink-100 border border-pink-200 text-pink-600 rounded-xl p-3 text-xs font-bold animate-pulse">
                  Opponent is requesting a rematch!
                </div>
              )}

              {rematchRequestedByMe && !rematchRequestedByOpponent ? (
                <button
                  disabled
                  className="w-full bg-pink-100 text-pink-400 border border-pink-200 py-3.5 rounded-2xl font-bold animate-pulse cursor-not-allowed text-center"
                >
                  Rematch Requested...
                </button>
              ) : (
                <button
                  onClick={handleRequestRematch}
                  disabled={forfeit}
                  className={`w-full py-3.5 rounded-2xl font-bold transition-all flex justify-center items-center space-x-2 shadow-md
                    ${forfeit
                      ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      : 'bg-pink-500 text-white hover:bg-pink-600 active:scale-[0.98] shadow-pink-100'
                    }
                  `}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>
                    {rematchRequestedByOpponent ? 'Accept Rematch' : 'Request Rematch'}
                  </span>
                </button>
              )}

              <button
                onClick={handleLeaveRoom}
                className="w-full bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 py-3 rounded-2xl font-bold text-xs transition-colors flex justify-center items-center space-x-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Room</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* 4. Footer */}
      <footer className="py-4 text-center border-t border-pink-100/40 bg-white/40">
        <p className="font-sans text-[10px] text-gray-400 font-semibold tracking-wide">
          Number Duel — 2-Player Guessing Game
        </p>
      </footer>
    </div>
  );
}
