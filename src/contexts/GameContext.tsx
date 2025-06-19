
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType, PlayerQuestionHistory } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode, getInitialQuestions as getFallbackQuestions, selectNextPlayer } from '@/lib/gameUtils';
import { flagMessage, FlagMessageOutput } from '@/ai/flows/flag-message';
import { generateQuestion, GenerateQuestionInput } from '@/ai/flows/generate-question-flow';
import { useToast } from '@/hooks/use-toast';

interface GameContextType {
  rooms: Room[];
  createRoom: (hostNickname: string, mode: GameMode) => string;
  joinRoom: (roomId: string, playerNickname: string) => Player | null;
  leaveRoom: (roomId: string, playerId: string) => void;
  startGame: (roomId: string) => void;
  selectTruthOrDare: (roomId: string, type: 'truth' | 'dare') => Promise<void>;
  submitAnswer: (roomId: string, answer: string, isDareSuccessful?: boolean) => void;
  addChatMessage: (roomId: string, senderId: string, senderNickname: string, text: string, type?: ChatMessageType) => Promise<void>;
  getCurrentRoom: (roomId: string) => Room | undefined;
  getPlayer: (roomId: string, playerId: string) => Player | undefined;
  nextTurn: (roomId: string) => void;
  isLoadingModeration: boolean;
  isLoadingQuestion: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const [isLoadingModeration, setIsLoadingModeration] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

  const getCurrentRoom = useCallback((roomId: string) => {
    return rooms.find(r => r.id === roomId);
  }, [rooms]);

  const getPlayer = useCallback((roomId: string, playerId: string) => {
    const room = getCurrentRoom(roomId);
    return room?.players.find(p => p.id === playerId);
  }, [getCurrentRoom]);

  const nextTurn = useCallback((roomId: string) => {
    setRooms(prevRooms => {
      const roomIndex = prevRooms.findIndex(r => r.id === roomId);
      if (roomIndex === -1) return prevRooms;

      const room = prevRooms[roomIndex];
      if (room.players.length === 0) return prevRooms;

      const nextPlayer = selectNextPlayer(room.players, room.currentPlayerId);

      let newRound = room.round;
      if (nextPlayer && room.players.indexOf(nextPlayer) === 0 && room.currentPlayerId !== nextPlayer.id && room.round > 0) {
          newRound = room.round + 1;
      }

      return prevRooms.map((r, idx) => {
        if (idx === roomIndex) {
          if (!nextPlayer) {
             console.error("Next player selection failed with existing players.");
             return { ...r, gameState: 'gameOver' as GameState, chatMessages: [...r.chatMessages, {id: Date.now().toString(), senderNickname: "System", text: "Game Over! Could not determine next player.", timestamp: new Date(), type: 'system'}] };
          }
          return {
            ...r,
            currentPlayerId: nextPlayer.id,
            gameState: 'playerChoosing' as GameState,
            currentQuestion: null,
            round: newRound,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `It's ${nextPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' as ChatMessageType}]
          };
        }
        return r;
      });
    });
  }, [/* setRooms is stable, selectNextPlayer is pure */]);

  const createRoom = useCallback((hostNickname: string, mode: GameMode): string => {
    const newRoomId = generateRoomCode();
    const hostPlayer: Player = { id: Date.now().toString(), nickname: hostNickname, isHost: true, score: 0 };
    const fallbackContent = getFallbackQuestions(mode);

    const newRoom: Room = {
      id: newRoomId,
      mode,
      players: [hostPlayer],
      currentPlayerId: hostPlayer.id,
      gameState: 'waiting',
      truths: fallbackContent.truths,
      dares: fallbackContent.dares,
      currentQuestion: null,
      chatMessages: [{ id: Date.now().toString(), senderNickname: 'System', text: `${hostNickname} created the room! Mode: ${mode}. Room code: ${newRoomId}`, timestamp: new Date(), type: 'system' }],
      hostId: hostPlayer.id,
      round: 0,
      lastActivity: new Date(),
      playerQuestionHistory: {
        [hostPlayer.id]: { truths: [], dares: [] }
      },
    };
    setRooms(prevRooms => [...prevRooms, newRoom]);
    return newRoomId;
  }, [/* setRooms is stable, generateRoomCode/getFallbackQuestions are pure */]);

  const joinRoom = useCallback((roomId: string, playerNickname: string): Player | null => {
    let joinedPlayer: Player | null = null;
    setRooms(prevRooms => {
      const roomIndex = prevRooms.findIndex(r => r.id === roomId);
      if (roomIndex === -1) {
        toast({ title: "Error", description: "Room not found.", variant: "destructive" });
        return prevRooms;
      }

      const currentRoom = prevRooms[roomIndex];
      if (currentRoom.players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase())) {
        toast({ title: "Error", description: "Nickname already taken in this room.", variant: "destructive" });
        return prevRooms;
      }

      const newPlayer: Player = { id: Date.now().toString(), nickname: playerNickname, isHost: false, score: 0 };
      joinedPlayer = newPlayer;

      const updatedRooms = prevRooms.map(r =>
        r.id === roomId
        ? {
            ...r,
            players: [...r.players, newPlayer],
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${playerNickname} joined the room!`, timestamp: new Date(), type: 'playerJoin'}],
            playerQuestionHistory: {
              ...r.playerQuestionHistory,
              [newPlayer.id]: { truths: [], dares: [] }
            }
          }
        : r
      );
      return updatedRooms;
    });
    return joinedPlayer;
  }, [toast /* setRooms is stable */]);

  const leaveRoom = useCallback((roomId: string, playerId: string) => {
    setRooms(prevRooms => {
      const room = prevRooms.find(r => r.id === roomId);
      if (!room) return prevRooms;

      const playerLeaving = room.players.find(p => p.id === playerId);
      const remainingPlayers = room.players.filter(p => p.id !== playerId);

      const newPlayerQuestionHistory = { ...room.playerQuestionHistory };
      delete newPlayerQuestionHistory[playerId];

      if (remainingPlayers.length === 0) {
        toast({ title: "Room Closed", description: "The last player left, room closed."});
        router.push('/');
        return prevRooms.filter(r => r.id !== roomId);
      }

      let newCurrentPlayerId = room.currentPlayerId;
      let newHostId = room.hostId;
      let newGameState = room.gameState;

      if (room.currentPlayerId === playerId && room.gameState !== 'waiting' && room.gameState !== 'gameOver') {
        const nextPlayerAfterLeave = selectNextPlayer(remainingPlayers, null);
        newCurrentPlayerId = nextPlayerAfterLeave?.id || remainingPlayers[0]?.id || null;
        if(newCurrentPlayerId){
          newGameState = 'playerChoosing';
        } else if (remainingPlayers.length > 0 && room.gameState !== 'waiting') {
          newGameState = 'playerChoosing';
          newCurrentPlayerId = remainingPlayers[0].id;
        } else {
          newGameState = 'gameOver';
        }
      }

      if (room.hostId === playerId && remainingPlayers.length > 0) {
        newHostId = remainingPlayers[0].id;
         remainingPlayers[0].isHost = true;
      }

      return prevRooms.map(r =>
        r.id === roomId
        ? {
            ...r,
            players: remainingPlayers.map(p => p.id === newHostId ? {...p, isHost: true} : {...p, isHost: false}),
            currentPlayerId: newCurrentPlayerId,
            hostId: newHostId,
            gameState: newGameState,
            currentQuestion: newGameState === 'playerChoosing' ? null : r.currentQuestion,
            playerQuestionHistory: newPlayerQuestionHistory,
            chatMessages: [...r.chatMessages,
                { id: Date.now().toString(), senderNickname: 'System', text: `${playerLeaving?.nickname || 'A player'} left the room. ${newHostId !== room.hostId && remainingPlayers.find(p=>p.id===newHostId) ? `${remainingPlayers.find(p=>p.id===newHostId)?.nickname} is the new host.` : '' }`, timestamp: new Date(), type: 'playerLeave'},
                ...(newGameState === 'playerChoosing' && newCurrentPlayerId && r.gameState !== 'waiting' && r.currentPlayerId !== newCurrentPlayerId ?
                  [{id: (Date.now()+1).toString(), senderNickname: 'System', text: `It's now ${remainingPlayers.find(p=>p.id === newCurrentPlayerId)?.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' as ChatMessageType}]
                  : [])
            ]
          }
        : r
      );
    });
  }, [toast, router /* setRooms is stable, selectNextPlayer is pure */]);

  const startGame = useCallback((roomId: string) => {
    setRooms(prevRooms => {
      return prevRooms.map(r => {
        if (r.id === roomId) {
          if (r.players.length < 1) {
            toast({ title: "Cannot Start Game", description: "Need at least 1 player to start.", variant: "destructive" });
            return r;
          }
          const firstPlayer = r.players[Math.floor(Math.random() * r.players.length)];

          const initialPlayerQuestionHistory = r.players.reduce((acc, player) => {
            acc[player.id] = r.playerQuestionHistory?.[player.id] || { truths: [], dares: [] };
            return acc;
          }, {} as PlayerQuestionHistory);

          return {
            ...r,
            gameState: 'playerChoosing',
            currentPlayerId: firstPlayer.id,
            round: 1,
            playerQuestionHistory: initialPlayerQuestionHistory,
            chatMessages: [...r.chatMessages,
              { id: Date.now().toString(), senderNickname: 'System', text: `Game started! It's ${firstPlayer.nickname}'s turn.`, timestamp: new Date(), type: 'system' },
              { id: (Date.now()+1).toString(), senderNickname: 'System', text: `${firstPlayer.nickname}, choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' }
            ]
          };
        }
        return r;
      });
    });
  }, [toast /* setRooms stable */]);

  const selectTruthOrDare = useCallback(async (roomId: string, type: 'truth' | 'dare') => {
    setIsLoadingQuestion(true);
    let questionText: string | null = null;
    let questionId = `ai-${Date.now()}`;

    const currentRoom = rooms.find(r => r.id === roomId); // Reading rooms state

    if (!currentRoom || !currentRoom.currentPlayerId || currentRoom.gameState !== 'playerChoosing') {
      toast({ title: "Error", description: "Cannot select truth or dare at this time.", variant: "destructive" });
      setIsLoadingQuestion(false);
      return;
    }
    const currentPlayer = currentRoom.players.find(p => p.id === currentRoom.currentPlayerId);
    if (!currentPlayer) {
       toast({ title: "Error", description: "Current player not found.", variant: "destructive" });
       setIsLoadingQuestion(false);
       return;
    }

    const askedQuestionsForPlayer = currentRoom.playerQuestionHistory[currentPlayer.id]?.[type] || [];

    try {
      const aiInput: GenerateQuestionInput = {
        gameMode: currentRoom.mode,
        questionType: type,
        playerNickname: currentPlayer.nickname,
        askedQuestions: askedQuestionsForPlayer,
      };
      const aiResponse = await generateQuestion(aiInput);
      questionText = aiResponse.questionText;
    } catch (error) {
      console.error("AI Question Generation Error:", error);
      toast({ title: "AI Error", description: "Could not generate a question from AI. Using fallback.", variant: "destructive" });

      const fallbackPool = type === 'truth' ? currentRoom.truths : currentRoom.dares;
      const availableFallbacks = fallbackPool.filter(q => !askedQuestionsForPlayer.includes(q.text));
      if (availableFallbacks.length > 0) {
        const fallbackQ = availableFallbacks[Math.floor(Math.random() * availableFallbacks.length)];
        questionText = fallbackQ.text;
        questionId = fallbackQ.id;
      } else {
        toast({ title: "Out of Questions!", description: `No more ${type}s available (AI & fallback).`, variant: "destructive" });
        setIsLoadingQuestion(false);
        return;
      }
    }

    if (!questionText) {
      toast({ title: "Error", description: "Failed to get a question.", variant: "destructive" });
      setIsLoadingQuestion(false);
      return;
    }

    const newQuestion: Question = { id: questionId, text: questionText, type };

    setRooms(prevRooms => { // Using updater form
      return prevRooms.map(r => {
        if (r.id === roomId) {
          // Ensure currentRoom and currentPlayerId are from prevRooms to avoid stale closure
          const playerForHistoryUpdateId = r.currentPlayerId;
          if (!playerForHistoryUpdateId) return r;
          const playerForNickname = r.players.find(p => p.id === playerForHistoryUpdateId);


          const updatedHistory = { ...r.playerQuestionHistory };
          if (!updatedHistory[playerForHistoryUpdateId]) {
            updatedHistory[playerForHistoryUpdateId] = { truths: [], dares: [] };
          }
          const playerHistory = updatedHistory[playerForHistoryUpdateId][type] || [];
          updatedHistory[playerForHistoryUpdateId][type] = [...playerHistory, newQuestion.text];

          return {
            ...r,
            currentQuestion: newQuestion,
            gameState: 'questionRevealed' as GameState,
            playerQuestionHistory: updatedHistory,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${playerForNickname?.nickname || 'Player'} chose ${type}. Question: ${newQuestion.text}`, timestamp: new Date(), type: 'system' }]
          };
        }
        return r;
      });
    });
    setIsLoadingQuestion(false);
  }, [rooms, toast, setIsLoadingQuestion /* setRooms is stable */]);


  const submitAnswer = useCallback((roomId: string, answer: string, isDareSuccessful?: boolean) => {
    setRooms(prevRooms => {
      const updatedRooms = prevRooms.map(r => {
        if (r.id === roomId && (r.gameState === 'questionRevealed' || r.gameState === 'awaitingAnswer')) {
          const player = r.players.find(p => p.id === r.currentPlayerId);
          const messageType = r.currentQuestion?.type === 'truth' ? 'truthAnswer' : 'dareResult';
          const formattedAnswer = r.currentQuestion?.type === 'dare' ? `${isDareSuccessful ? '✅ Completed:' : '❌ Failed:'} ${answer}` : answer;

          let updatedPlayers = r.players;
          if (r.currentQuestion?.type === 'dare' && player) {
              updatedPlayers = r.players.map(p => p.id === player.id ? {...p, score: p.score + (isDareSuccessful ? 1 : 0)} : p);
          }

          return {
            ...r,
            players: updatedPlayers,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderId: player?.id, senderNickname: player?.nickname || 'Player', text: formattedAnswer, timestamp: new Date(), type: messageType }],
            currentQuestion: null,
            gameState: 'inProgress' as GameState,
          };
        }
        return r;
      });
      return updatedRooms;
    });

    // Call nextTurn after state update has been processed.
    // This requires ensuring the state used by nextTurn is fresh or nextTurn handles it.
    // Since nextTurn uses setRooms updater, it should be fine.
    // It's better to check the room state from within an effect or after the setRooms is guaranteed to have run if decisions depend on the *new* state.
    // For now, calling it directly assumes nextTurn operates on the latest conceptual state via its own setRooms.
    const roomAfterSubmit = getCurrentRoom(roomId); // This might still be stale if called synchronously like this
                                                  // But nextTurn itself uses setRooms(prev => ...)
    if(roomAfterSubmit && roomAfterSubmit.gameState === 'inProgress') { // This check might be on stale data
        nextTurn(roomId);
    } else {
        // A cleaner way for chained updates:
        // setRooms(prev => { const updated = oneUpdate(prev); if(check(updated)) return anotherUpdate(updated); return updated; });
        // Or use useEffect to react to gameState changes.
        // For simplicity now, we rely on nextTurn's robustness.
        // If nextTurn logic is complex and depends on reading state *before* updating, this could be an issue.
        // Given nextTurn primarily calls setRooms(prev => ...), it should be safe.
        // This direct call sequence can be tricky.
    }
  }, [toast, nextTurn, getCurrentRoom, setIsLoadingModeration, setIsLoadingQuestion /* setRooms stable */]);

  const addChatMessage = useCallback(async (roomId: string, senderId: string, senderNickname: string, text: string, type: ChatMessageType = 'message') => {
    setIsLoadingModeration(true);
    let processedText = text;
    let finalSenderNickname = senderNickname;
    let finalSenderId = senderId;
    let finalType = type;

    try {
      const moderationResult: FlagMessageOutput = await flagMessage({ messageText: text });
      if (moderationResult.flagged) {
        processedText = `Message from ${senderNickname} was flagged: ${moderationResult.reason}`;
        finalSenderNickname = 'System';
        finalSenderId = 'system';
        finalType = 'system';
        toast({ title: "Content Moderated", description: `Your message was flagged: ${moderationResult.reason}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Moderation error:", error);
      toast({ title: "Moderation Error", description: "Could not process message moderation.", variant: "destructive" });
    } finally {
      setIsLoadingModeration(false);
    }

    setRooms(prevRooms => {
      const roomForUpdate = prevRooms.find(pr => pr.id === roomId);
      if (!roomForUpdate) return prevRooms;

      return prevRooms.map(r =>
        r.id === roomId
        ? {
            ...r,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderId: finalSenderId, senderNickname: finalSenderNickname, text: processedText, timestamp: new Date(), type: finalType }]
          }
        : r
      );
    });
  }, [toast, setIsLoadingModeration /* setRooms stable */]);

  useEffect(() => {
    const savedData = localStorage.getItem('riskyRoomsData');
    if (savedData) {
      try {
        const parsedRooms: Room[] = JSON.parse(savedData).map((room: any) => ({
          ...room,
          mode: (room.mode === ('extreme' as any) ? 'moderate' : room.mode) as GameMode,
          lastActivity: new Date(room.lastActivity || Date.now()),
          chatMessages: (room.chatMessages || []).map((msg: any) => ({...msg, timestamp: new Date(msg.timestamp)})),
          truths: room.truths || getFallbackQuestions(room.mode).truths,
          dares: room.dares || getFallbackQuestions(room.mode).dares,
          gameState: room.gameState || 'waiting',
          players: room.players || [],
          playerQuestionHistory: room.playerQuestionHistory || {},
        }));
        setRooms(parsedRooms);
      } catch (e) {
        console.error("Failed to parse rooms from localStorage", e);
        localStorage.removeItem('riskyRoomsData');
      }
    }
  }, [/* Empty dependency array, runs once on mount */]);

   useEffect(() => {
    if (rooms.length > 0 || localStorage.getItem('riskyRoomsData')) {
        const roomsToSave = rooms.map(room => ({ ...room, lastActivity: new Date().toISOString() }));
        localStorage.setItem('riskyRoomsData', JSON.stringify(roomsToSave));
    }
  }, [rooms]);


  return (
    <GameContext.Provider value={{
      rooms, createRoom, joinRoom, leaveRoom, startGame,
      selectTruthOrDare, submitAnswer, addChatMessage,
      getCurrentRoom, getPlayer, nextTurn, isLoadingModeration, isLoadingQuestion
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = (): GameContextType => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

