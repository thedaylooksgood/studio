
export type GameMode = 'minimal' | 'moderate';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  score: number; // Optional: can be used for tracking points
}

export type ChatMessageType = 'message' | 'truthAnswer' | 'dareResult' | 'system' | 'playerJoin' | 'playerLeave' | 'turnChange';

export interface ChatMessage {
  id: string;
  senderId?: string; // Player ID or 'system'
  senderNickname: string;
  text: string;
  timestamp: Date;
  type: ChatMessageType;
}

export interface Question {
  id: string;
  text: string;
  type: 'truth' | 'dare';
  submittedBy?: string; // Player ID for user-submitted questions - will be unused now
  isUserSubmitted?: boolean; // will be unused now
}

export type GameState = 'waiting' | 'inProgress' | 'playerChoosing' | 'questionRevealed' | 'awaitingAnswer' | 'gameOver';

export interface Room {
  id: string; // Room code
  mode: GameMode;
  players: Player[];
  currentPlayerId: string | null;
  gameState: GameState;
  truths: Question[];
  dares: Question[];
  currentQuestion: Question | null;
  chatMessages: ChatMessage[];
  hostId: string | null;
  round: number;
  timerValue?: number;
  lastActivity: Date;
}

export interface PreloadedContent {
  truths: string[];
  dares: string[];
}
