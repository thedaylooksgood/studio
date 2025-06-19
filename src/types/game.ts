
export type GameMode = 'minimal' | 'moderate';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  score: number;
}

export type ChatMessageType = 'message' | 'truthAnswer' | 'dareResult' | 'system' | 'playerJoin' | 'playerLeave' | 'turnChange';

export interface ChatMessage {
  id:string;
  senderId?: string;
  senderNickname: string;
  text: string;
  timestamp: Date;
  type: ChatMessageType;
}

export interface Question {
  id: string;
  text: string;
  type: 'truth' | 'dare';
}

export type GameState = 'waiting' | 'inProgress' | 'playerChoosing' | 'questionRevealed' | 'awaitingAnswer' | 'gameOver';

// Stores history of question TEXTS asked to each player for each type
export type PlayerQuestionHistory = Record<string, {
  truths: string[];
  dares: string[];
}>;

export interface Room {
  id: string; // Room code
  mode: GameMode;
  players: Player[];
  currentPlayerId: string | null;
  gameState: GameState;
  truths: Question[]; // Fallback preloaded truths
  dares: Question[]; // Fallback preloaded dares
  currentQuestion: Question | null;
  chatMessages: ChatMessage[];
  hostId: string | null;
  round: number;
  timerValue?: number;
  lastActivity: Date;
  playerQuestionHistory: PlayerQuestionHistory;
}

export interface PreloadedContent {
  truths: string[];
  dares: string[];
}
