
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType, PlayerQuestionHistory } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
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
  selectTruthOrDare: (roomId: string, type: 'truth' | 'dare') => Promise<void>; // Now async
  submitAnswer: (roomId: string, answer: string, isDareSuccessful?: boolean) => void;
  addChatMessage: (roomId: string, senderId: string, senderNickname: string, text: string, type?: ChatMessageType) => Promise<void>;
  getCurrentRoom: (roomId: string) => Room | undefined;
  getPlayer: (roomId: string, playerId: string) => Player | undefined;
  nextTurn: (roomId: string) => void;
  isLoadingModeration: boolean;
  isLoadingQuestion: boolean; // New state for question generation
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const { toast } = useToast();
  const [isLoadingModeration, setIsLoadingModeration] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

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
      truths: fallbackContent.truths, // Fallback
      dares: fallbackContent.dares,   // Fallback
      currentQuestion: null,
      chatMessages: [{ id: Date.now().toString(), senderNickname: 'System', text: `${hostNickname} created the room! Mode: ${mode}. Room code: ${newRoomId}`, timestamp: new Date(), type: 'system' }],
      hostId: hostPlayer.id,
      round: 0,
      lastActivity: new Date(),
      playerQuestionHistory: {}, // Initialize empty history
    };
    setRooms(prevRooms => [...prevRooms, newRoom]);
    return newRoomId;
  }, []); 

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
            playerQuestionHistory: { // Initialize history for new player
              ...r.playerQuestionHistory,
              [newPlayer.id]: { truths: [], dares: [] }
            }
          } 
        : r
      );
      return updatedRooms;
    });
    return joinedPlayer;
  }, [toast]);

  const leaveRoom = useCallback((roomId: string, playerId: string) => {
    setRooms(prevRooms => {
      const room = prevRooms.find(r => r.id === roomId);
      if (!room) return prevRooms;

      const playerLeaving = room.players.find(p => p.id === playerId);
      const remainingPlayers = room.players.filter(p => p.id !== playerId);
      
      // Clean up player question history
      const newPlayerQuestionHistory = { ...room.playerQuestionHistory };
      delete newPlayerQuestionHistory[playerId];
      
      if (remainingPlayers.length === 0) {
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
      }
      
      return prevRooms.map(r => 
        r.id === roomId 
        ? { 
            ...r, 
            players: remainingPlayers.map(p => p.id === newHostId ? {...p, isHost: true} : p),
            currentPlayerId: newCurrentPlayerId,
            hostId: newHostId,
            gameState: newGameState,
            currentQuestion: newGameState === 'playerChoosing' ? null : r.currentQuestion,
            playerQuestionHistory: newPlayerQuestionHistory,
            chatMessages: [...r.chatMessages, 
                { id: Date.now().toString(), senderNickname: 'System', text: `${playerLeaving?.nickname || 'A player'} left the room.`, timestamp: new Date(), type: 'playerLeave'},
                ...(newGameState === 'playerChoosing' && newCurrentPlayerId && r.gameState !== 'waiting' && r.currentPlayerId !== newCurrentPlayerId ? 
                  [{id: (Date.now()+1).toString(), senderNickname: 'System', text: `It's now ${remainingPlayers.find(p=>p.id === newCurrentPlayerId)?.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' as ChatMessageType}] 
                  : [])
            ]
          } 
        : r
      );
    });
  }, []); 

  const startGame = useCallback((roomId: string) => {
    setRooms(prevRooms => {
      return prevRooms.map(r => {
        if (r.id === roomId) {
          if (r.players.length < 1) {
            toast({ title: "Cannot Start Game", description: "Need at least 1 player to start.", variant: "destructive" });
            return r;
          }
          const firstPlayer = r.players[Math.floor(Math.random() * r.players.length)];
          
          // Initialize player question history for all players if not already present
          const initialPlayerQuestionHistory = r.players.reduce((acc, player) => {
            if (!r.playerQuestionHistory[player.id]) {
              acc[player.id] = { truths: [], dares: [] };
            } else {
              acc[player.id] = r.playerQuestionHistory[player.id];
            }
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
  }, [toast]);

  const selectTruthOrDare = useCallback(async (roomId: string, type: 'truth' | 'dare') => {
    setIsLoadingQuestion(true);
    let questionText: string | null = null;
    let questionId = `ai-${Date.now()}`;

    const room = rooms.find(r => r.id === roomId);
    if (!room || !room.currentPlayerId || room.gameState !== 'playerChoosing') {
      toast({ title: "Error", description: "Cannot select truth or dare at this time.", variant: "destructive" });
      setIsLoadingQuestion(false);
      return;
    }
    const currentPlayer = room.players.find(p => p.id === room.currentPlayerId);
    if (!currentPlayer) {
       toast({ title: "Error", description: "Current player not found.", variant: "destructive" });
       setIsLoadingQuestion(false);
       return;
    }

    const askedQuestionsForPlayer = room.playerQuestionHistory[currentPlayer.id]?.[type] || [];

    try {
      const aiInput: GenerateQuestionInput = {
        gameMode: room.mode,
        questionType: type,
        playerNickname: currentPlayer.nickname,
        askedQuestions: askedQuestionsForPlayer,
      };
      const aiResponse = await generateQuestion(aiInput);
      questionText = aiResponse.questionText;
    } catch (error) {
      console.error("AI Question Generation Error:", error);
      toast({ title: "AI Error", description: "Could not generate a question from AI. Using fallback.", variant: "destructive" });
      
      // Fallback logic
      const fallbackPool = type === 'truth' ? room.truths : room.dares;
      const availableFallbacks = fallbackPool.filter(q => !askedQuestionsForPlayer.includes(q.text));
      if (availableFallbacks.length > 0) {
        const fallbackQ = availableFallbacks[Math.floor(Math.random() * availableFallbacks.length)];
        questionText = fallbackQ.text;
        questionId = fallbackQ.id;
      } else {
        toast({ title: "Out of Questions!", description: `No more ${type}s available (AI & fallback).`, variant: "destructive" });
        setIsLoadingQuestion(false);
        return; // Stay in 'playerChoosing'
      }
    }

    if (!questionText) {
      toast({ title: "Error", description: "Failed to get a question.", variant: "destructive" });
      setIsLoadingQuestion(false);
      return;
    }

    const newQuestion: Question = { id: questionId, text: questionText, type };

    setRooms(prevRooms => {
      return prevRooms.map(r => {
        if (r.id === roomId) {
          const updatedHistory = { ...r.playerQuestionHistory };
          if (!updatedHistory[currentPlayer.id]) {
            updatedHistory[currentPlayer.id] = { truths: [], dares: [] };
          }
          updatedHistory[currentPlayer.id][type] = [...(updatedHistory[currentPlayer.id][type] || []), newQuestion.text];
          
          return {
            ...r,
            currentQuestion: newQuestion,
            gameState: 'questionRevealed' as GameState,
            playerQuestionHistory: updatedHistory,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${currentPlayer.nickname} chose ${type}. Question: ${newQuestion.text}`, timestamp: new Date(), type: 'system' }]
          };
        }
        return r;
      });
    });
    setIsLoadingQuestion(false);
  }, [rooms, toast]); // rooms dependency is important here for accessing current room state
  
  const nextTurn = useCallback((roomId: string) => {
    setRooms(prevRooms => {
      const roomIndex = prevRooms.findIndex(r => r.id === roomId);
      if (roomIndex === -1) return prevRooms;
      
      const room = prevRooms[roomIndex];
      if (room.players.length === 0) return prevRooms; 

      const nextPlayer = selectNextPlayer(room.players, room.currentPlayerId);
      
      let newRound = room.round;
      if (room.players.length > 0 && nextPlayer && room.players.indexOf(nextPlayer) === 0 && room.round > 0 && room.currentPlayerId !== nextPlayer.id) {
          newRound = room.round + 1;
      }

      return prevRooms.map((r, idx) => {
        if (idx === roomIndex) {
          if (!nextPlayer) { 
             console.error("Next player selection failed with existing players.");
             return { ...r, gameState: 'gameOver' as GameState };
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
  }, []); 

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
    nextTurn(roomId);
  }, [nextTurn]);


  const addChatMessage = useCallback(async (roomId: string, senderId: string, senderNickname: string, text: string, type: ChatMessageType = 'message') => {
    const currentRoom = rooms.find(r => r.id === roomId);
    if (!currentRoom) return;

    let processedText = text;
    let finalSenderNickname = senderNickname;
    let finalSenderId = senderId;
    let finalType = type;

    setIsLoadingModeration(true);
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
      return prevRooms.map(r => 
        r.id === roomId 
        ? { 
            ...r, 
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderId: finalSenderId, senderNickname: finalSenderNickname, text: processedText, timestamp: new Date(), type: finalType }]
          } 
        : r
      );
    });
  }, [rooms, toast]); 

  const getCurrentRoom = useCallback((roomId: string) => rooms.find(r => r.id === roomId), [rooms]);
  const getPlayer = useCallback((roomId: string, playerId: string) => getCurrentRoom(roomId)?.players.find(p => p.id === playerId), [getCurrentRoom]);

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
          playerQuestionHistory: room.playerQuestionHistory || {}, // Ensure history is loaded
        }));
        setRooms(parsedRooms);
      } catch (e) {
        console.error("Failed to parse rooms from localStorage", e);
        localStorage.removeItem('riskyRoomsData');
      }
    }
  }, []);

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
