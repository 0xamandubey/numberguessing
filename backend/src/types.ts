export interface Player {
  id: string; // Socket ID
  sessionToken: string;
  isOnline: boolean;
  name: string; // Player A or Player B
  ready: boolean;
  secret: number | null;
}

export interface Guess {
  guess: number;
  hint: 'higher' | 'lower' | 'correct' | 'digit-match';
  matches?: boolean[]; // Array of 4 booleans indicating if each digit in the guess matches the secret code at that position
  timestamp: number;
}

export interface Room {
  roomCode: string;
  players: Player[];
  guesses: { [playerId: string]: Guess[] };
  currentTurn: string | null; // socket ID of the player whose turn it is
  gameStarted: boolean;
  gameOver: boolean;
  winnerId: string | null;
  rematchRequests: string[]; // List of socket IDs requesting rematch
  hintMode: 'higher-lower' | 'digit-match';
}

