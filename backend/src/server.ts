import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { Room, Player, Guess } from './types';

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'ok', timestamp: new Date() });
});

// Serve frontend build static files if built
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));

// Fallback all other routes to index.html for React SPA compatibility
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      // Frontend not built or missing - fallback to Express default behavior
      next();
    }
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for MVP simplicity
    methods: ['GET', 'POST']
  }
});

// Authoritative in-memory room storage
const rooms: { [code: string]: Room } = {};

// Helper to generate a unique room code of 4 letters, avoiding confusing characters
const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateRoomCode(): string {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_CHARACTERS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length));
    }
  } while (rooms[code]); // Ensure uniqueness
  return code;
}

// Helper to get room code for a socket
function getSocketRoom(socket: Socket): Room | null {
  for (const code in rooms) {
    const room = rooms[code];
    if (room.players.some(p => p.id === socket.id)) {
      return room;
    }
  }
  return null;
}

// Clean up player from room
function handlePlayerLeave(socket: Socket) {
  const room = getSocketRoom(socket);
  if (!room) return;

  const leavingPlayerIndex = room.players.findIndex(p => p.id === socket.id);
  if (leavingPlayerIndex === -1) return;

  const leavingPlayer = room.players[leavingPlayerIndex];
  room.players.splice(leavingPlayerIndex, 1);

  // Notify remaining player
  io.to(room.roomCode).emit('player-left', {
    playerId: socket.id,
    playerName: leavingPlayer.name
  });

  // If room is empty, delete it
  if (room.players.length === 0) {
    delete rooms[room.roomCode];
    console.log(`Room ${room.roomCode} deleted (empty).`);
  } else {
    // If game was active, set it to game over due to forfeit
    if (room.gameStarted && !room.gameOver) {
      room.gameOver = true;
      room.winnerId = room.players[0].id; // The remaining player wins
      io.to(room.roomCode).emit('game-over', {
        winnerId: room.winnerId,
        players: room.players,
        forfeit: true
      });
    }
    // Reset rematch state
    room.rematchRequests = [];
  }
  socket.leave(room.roomCode);
}

io.on('connection', (socket: Socket) => {
  console.log(`Player connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create-room', () => {
    // Leave any existing rooms
    handlePlayerLeave(socket);

    const roomCode = generateRoomCode();
    const newRoom: Room = {
      roomCode,
      players: [
        {
          id: socket.id,
          name: 'Player A',
          ready: false,
          secret: null
        }
      ],
      guesses: {},
      currentTurn: null,
      gameStarted: false,
      gameOver: false,
      winnerId: null,
      rematchRequests: []
    };

    rooms[roomCode] = newRoom;
    socket.join(roomCode);
    socket.emit('room-created', {
      roomCode,
      players: newRoom.players
    });
    console.log(`Room created: ${roomCode} by ${socket.id}`);
  });

  // 2. Join Room
  socket.on('join-room', (payload: { roomCode: string }) => {
    if (!payload || !payload.roomCode) {
      socket.emit('error-message', { message: 'Invalid room code.' });
      return;
    }

    const roomCode = payload.roomCode.toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('error-message', { message: 'Room not found.' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error-message', { message: 'Room is full.' });
      return;
    }

    // Leave any existing rooms
    handlePlayerLeave(socket);

    const newPlayer: Player = {
      id: socket.id,
      name: 'Player B',
      ready: false,
      secret: null
    };

    room.players.push(newPlayer);
    socket.join(roomCode);

    // Notify all players in room
    io.to(roomCode).emit('player-joined', {
      roomCode,
      players: room.players
    });
    console.log(`Player ${socket.id} joined room ${roomCode}`);
  });

  // 3. Player Ready (Waiting Room)
  socket.on('player-ready', () => {
    const room = getSocketRoom(socket);
    if (!room) {
      socket.emit('error-message', { message: 'You are not in a room.' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ready = true;
    console.log(`Player ${player.name} (${socket.id}) in Room ${room.roomCode} is READY`);

    // Let everyone know about ready status update
    io.to(room.roomCode).emit('player-joined', {
      roomCode: room.roomCode,
      players: room.players
    });

    // If both players are in the room and both are ready, move to Secret Number Screen
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      io.to(room.roomCode).emit('both-ready');
      console.log(`Both players ready in room ${room.roomCode}. Transitioning to Secret Entry.`);
    }
  });

  // 4. Set Secret Number
  socket.on('set-secret', (payload: { number: number }) => {
    const room = getSocketRoom(socket);
    if (!room) {
      socket.emit('error-message', { message: 'Room not found.' });
      return;
    }

    const secretVal = payload?.number;
    if (typeof secretVal !== 'number' || secretVal < 0 || secretVal > 9999 || !Number.isInteger(secretVal)) {
      socket.emit('error-message', { message: 'Secret must be a 4-digit integer between 0000 and 9999.' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.secret = secretVal;
    console.log(`Player ${player.name} locked secret: **** in room ${room.roomCode}`);

    // Check if both players have set their secret
    const allSecretsSet = room.players.length === 2 && room.players.every(p => p.secret !== null);

    if (allSecretsSet) {
      // Perform Coin Toss
      const tossIndex = Math.random() < 0.5 ? 0 : 1;
      const starter = room.players[tossIndex];
      room.currentTurn = starter.id;
      room.gameStarted = true;
      room.guesses = {
        [room.players[0].id]: [],
        [room.players[1].id]: []
      };

      // Notify clients to show Coin Toss Animation and start the game
      io.to(room.roomCode).emit('game-started', {
        currentTurn: room.currentTurn,
        players: room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready })), // Hide secrets on client!
        coinTossWinnerId: starter.id
      });
      console.log(`Game started in room ${room.roomCode}. Turn: ${starter.name} (${starter.id})`);
    } else {
      // Just acknowledge secret submission to the sender, so they see "Locked / Waiting for Opponent"
      socket.emit('secret-locked');
    }
  });

  // 5. Submit Guess
  socket.on('submit-guess', (payload: { guess: number }) => {
    const room = getSocketRoom(socket);
    if (!room) {
      socket.emit('error-message', { message: 'Room not found.' });
      return;
    }

    if (!room.gameStarted || room.gameOver) {
      socket.emit('error-message', { message: 'Game is not in progress.' });
      return;
    }

    if (room.currentTurn !== socket.id) {
      socket.emit('error-message', { message: 'It is not your turn.' });
      return;
    }

    const guessVal = payload?.guess;
    if (typeof guessVal !== 'number' || guessVal < 0 || guessVal > 9999 || !Number.isInteger(guessVal)) {
      socket.emit('error-message', { message: 'Guess must be a 4-digit integer between 0000 and 9999.' });
      return;
    }

    const opponent = room.players.find(p => p.id !== socket.id);
    if (!opponent || opponent.secret === null) {
      socket.emit('error-message', { message: 'Opponent or opponent secret not found.' });
      return;
    }

    // Determine hint
    let result: 'higher' | 'lower' | 'correct' = 'correct';
    if (guessVal < opponent.secret) {
      result = 'higher';
    } else if (guessVal > opponent.secret) {
      result = 'lower';
    }

    const guessRecord: Guess = {
      guess: guessVal,
      hint: result,
      timestamp: Date.now()
    };

    // Store guess record
    if (!room.guesses[socket.id]) {
      room.guesses[socket.id] = [];
    }
    room.guesses[socket.id].push(guessRecord);

    // Emit result
    io.to(room.roomCode).emit('guess-result', {
      playerId: socket.id,
      guess: guessVal,
      hint: result,
      history: room.guesses[socket.id]
    });

    if (result === 'correct') {
      room.gameOver = true;
      room.winnerId = socket.id;
      io.to(room.roomCode).emit('game-over', {
        winnerId: room.winnerId,
        players: room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, secret: p.secret })) // Expose secrets now that it's game over!
      });
      console.log(`Game over in room ${room.roomCode}. Winner: ${socket.id}`);
    } else {
      // Switch Turn
      room.currentTurn = opponent.id;
      io.to(room.roomCode).emit('turn-changed', {
        currentTurn: room.currentTurn
      });
    }
  });

  // 6. Request Rematch
  socket.on('request-rematch', () => {
    const room = getSocketRoom(socket);
    if (!room) {
      socket.emit('error-message', { message: 'Room not found.' });
      return;
    }

    if (!room.gameOver) {
      socket.emit('error-message', { message: 'Game is still active.' });
      return;
    }

    if (!room.rematchRequests.includes(socket.id)) {
      room.rematchRequests.push(socket.id);
    }

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    console.log(`Rematch requested by ${requestingPlayer?.name} in room ${room.roomCode}`);

    if (room.rematchRequests.length === 2) {
      // Reset state for new round
      room.guesses = {};
      room.currentTurn = null;
      room.gameStarted = false;
      room.gameOver = false;
      room.winnerId = null;
      room.rematchRequests = [];
      room.players.forEach(p => {
        p.ready = false;
        p.secret = null;
      });

      io.to(room.roomCode).emit('rematch-started');
      console.log(`Rematch started in room ${room.roomCode}. Resetting players.`);
    } else {
      // Notify other player
      const opponent = room.players.find(p => p.id !== socket.id);
      if (opponent) {
        io.to(opponent.id).emit('rematch-requested', {
          requestedById: socket.id
        });
      }
    }
  });

  // 7. Leave Room Explicitly
  socket.on('leave-room', () => {
    handlePlayerLeave(socket);
  });

  // 8. Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handlePlayerLeave(socket);
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Number Duel AUTHORITATIVE Game Server running on port ${PORT}`);
});
