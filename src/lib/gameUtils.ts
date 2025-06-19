
import type { Player, Question, GameMode } from '@/types/game';
import { minimalContent, moderateContent } from '@/data/preloadedContent';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
  }
  return code;
}

export function getShuffledPlayers(players: Player[]): Player[] {
  return [...players].sort(() => Math.random() - 0.5);
}

export function selectNextPlayer(players: Player[], currentPlayerId: string | null): Player | null {
  if (players.length === 0) return null;
  if (players.length === 1) return players[0];

  if (currentPlayerId === null) {
    return players[Math.floor(Math.random() * players.length)];
  }

  const currentIndex = players.findIndex(p => p.id === currentPlayerId);
  const nextIndex = (currentIndex + 1) % players.length;
  return players[nextIndex];
}

export function getInitialQuestions(mode: GameMode): { truths: Question[], dares: Question[] } {
  let content;
  switch (mode) {
    case 'minimal':
      content = minimalContent;
      break;
    case 'moderate':
      content = moderateContent;
      break;
    default: 
      console.warn(`Unknown game mode: ${mode}, defaulting to minimal.`);
      content = minimalContent;
  }
  return {
    truths: content.truths.map((text, i) => ({ id: `truth-preloaded-${mode}-${i}`, text, type: 'truth', isUserSubmitted: false })),
    dares: content.dares.map((text, i) => ({ id: `dare-preloaded-${mode}-${i}`, text, type: 'dare', isUserSubmitted: false })),
  };
}

export function getRandomQuestion(questions: Question[], type: 'truth' | 'dare'): Question | null {
  const availableQuestions = questions.filter(q => q.type === type);
  if (availableQuestions.length === 0) return null;
  return availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
}
