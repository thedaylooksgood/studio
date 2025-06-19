
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { generateRoomCode, getInitialQuestions, selectNextPlayer, getRandomQuestion } from '@/lib/gameUtils';
import { flagMessage, FlagMessageOutput } from '@/ai/flows/flag-message';
import { useToast } from '@/hooks/use-toast';

interface GameContextType {
  rooms: Room[];
  createRoom: (hostNickname: string, mode: GameMode) => string;
  joinRoom: (roomId: string, playerNickname: string) => Player | null;
  leaveRoom: (roomId: string, playerId: string) => void;
  startGame: (roomId: string) => void;
  selectTruthOrDare: (roomId: string, type: 'truth' | 'dare') => void;
  submitAnswer: (roomId: string, answer: string, isDareSuccessful?: boolean) => void;
  addChatMessage: (roomId: string, senderId: string, senderNickname: string, text: string, type?: ChatMessageType) => Promise<void>;
  // addExtremeContent removed
  getCurrentRoom: (roomId: string) => Room | undefined;
  getPlayer: (roomId: string, playerId: string) => Player | undefined;
  nextTurn: (roomId: string) => void;
  isLoadingModeration: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const { toast } = useToast();
  const [isLoadingModeration, setIsLoadingModeration] = useState(false);

  const createRoom = useCallback((hostNickname: string, mode: GameMode): string => {
    const newRoomId = generateRoomCode();
    const hostPlayer: Player = { id: Date.now().toString(), nickname: hostNickname, isHost: true, score: 0 };
    const initialContent = getInitialQuestions(mode);

    const newRoom: Room = {
      id: newRoomId,
      mode,
      players: [hostPlayer],
      currentPlayerId: hostPlayer.id,
      gameState: 'waiting',
      truths: initialContent.truths,
      dares: initialContent.dares,
      currentQuestion: null,
      chatMessages: [{ id: Date.now().toString(), senderNickname: 'System', text: `${hostNickname} created the room! Mode: ${mode}. Room code: ${newRoomId}`, timestamp: new Date(), type: 'system' }],
      hostId: hostPlayer.id,
      round: 0,
      lastActivity: new Date(),
    };
    setRooms(prevRooms => {
        const updatedRooms = [...prevRooms, newRoom];
        localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
        return updatedRooms;
    });
    return newRoomId;
  }, [toast]); // Removed rooms, initialContent, etc from dependencies

  const joinRoom = useCallback((roomId: string, playerNickname: string): Player | null => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) {
      toast({ title: "Error", description: "Room not found.", variant: "destructive" });
      return null;
    }
    
    const currentRoom = rooms[roomIndex]; 
    if (currentRoom.players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase())) {
      toast({ title: "Error", description: "Nickname already taken in this room.", variant: "destructive" });
      return null;
    }

    const newPlayer: Player = { id: Date.now().toString(), nickname: playerNickname, isHost: false, score: 0 };
    
    setRooms(prevRooms => {
      const updatedRooms = prevRooms.map(r => 
        r.id === roomId 
        ? { 
            ...r, 
            players: [...r.players, newPlayer],
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${playerNickname} joined the room!`, timestamp: new Date(), type: 'playerJoin'}]
          } 
        : r
      );
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      return updatedRooms;
    });
    return newPlayer;
  }, [rooms, toast]);

  const leaveRoom = useCallback((roomId: string, playerId: string) => {
    setRooms(prevRooms => {
      const room = prevRooms.find(r => r.id === roomId);
      if (!room) return prevRooms;

      const playerLeaving = room.players.find(p => p.id === playerId);
      const remainingPlayers = room.players.filter(p => p.id !== playerId);
      
      if (remainingPlayers.length === 0) {
        const updatedRooms = prevRooms.filter(r => r.id !== roomId);
        localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
        return updatedRooms;
      }

      let newCurrentPlayerId = room.currentPlayerId;
      let newHostId = room.hostId;
      let newGameState = room.gameState;

      if (room.currentPlayerId === playerId && room.gameState !== 'waiting' && room.gameState !== 'gameOver') {
        const nextPlayerAfterLeave = selectNextPlayer(remainingPlayers, null);
        newCurrentPlayerId = nextPlayerAfterLeave?.id || null;
        if (!newCurrentPlayerId && remainingPlayers.length > 0) {
          newCurrentPlayerId = remainingPlayers[0].id;
        }
        if(newCurrentPlayerId){
          newGameState = 'playerChoosing';
        } else if (remainingPlayers.length > 0 && room.gameState !== 'waiting') {
          newGameState = 'playerChoosing';
          newCurrentPlayerId = remainingPlayers[0].id;
        } else if (remainingPlayers.length === 0) {
          newGameState = 'gameOver';
        }
      }
      
      if (room.hostId === playerId && remainingPlayers.length > 0) {
        newHostId = remainingPlayers[0].id; 
        const hostIndex = remainingPlayers.findIndex(p => p.id === newHostId);
        if (hostIndex !== -1) {
            remainingPlayers[hostIndex] = { ...remainingPlayers[hostIndex], isHost: true };
        }
      }
      
      const updatedRooms = prevRooms.map(r => 
        r.id === roomId 
        ? { 
            ...r, 
            players: remainingPlayers.map(p => p.id === newHostId ? {...p, isHost: true} : p),
            currentPlayerId: newCurrentPlayerId,
            hostId: newHostId,
            gameState: newGameState,
            currentQuestion: newGameState === 'playerChoosing' ? null : r.currentQuestion,
            chatMessages: [...r.chatMessages, 
                { id: Date.now().toString(), senderNickname: 'System', text: `${playerLeaving?.nickname || 'A player'} left the room.`, timestamp: new Date(), type: 'playerLeave'},
                ...(newGameState === 'playerChoosing' && newCurrentPlayerId && r.gameState !== 'waiting' ? 
                  [{id: (Date.now()+1).toString(), senderNickname: 'System', text: `It's now ${remainingPlayers.find(p=>p.id === newCurrentPlayerId)?.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' as ChatMessageType}] 
                  : [])
            ]
          } 
        : r
      );
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      return updatedRooms;
    });
  }, []); 

  const startGame = useCallback((roomId: string) => {
    setRooms(prevRooms => {
      const updatedRooms = prevRooms.map(r => {
        if (r.id === roomId) {
          if (r.players.length < 1) {
            toast({ title: "Cannot Start Game", description: "Need at least 1 player to start.", variant: "destructive" });
            return r;
          }
          const firstPlayer = r.players[Math.floor(Math.random() * r.players.length)];
          return {
            ...r,
            gameState: 'playerChoosing',
            currentPlayerId: firstPlayer.id,
            round: 1,
            chatMessages: [...r.chatMessages, 
              { id: Date.now().toString(), senderNickname: 'System', text: `Game started! It's ${firstPlayer.nickname}'s turn.`, timestamp: new Date(), type: 'system' },
              { id: (Date.now()+1).toString(), senderNickname: 'System', text: `${firstPlayer.nickname}, choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' }
            ]
          };
        }
        return r;
      });
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      return updatedRooms;
    });
  }, [toast]);

  const selectTruthOrDare = useCallback((roomId: string, type: 'truth' | 'dare') => {
    setRooms(prevRooms => {
      const updatedRooms = prevRooms.map(r => {
        if (r.id === roomId && r.gameState === 'playerChoosing') {
          const questions = type === 'truth' ? r.truths : r.dares;
          const question = getRandomQuestion(questions, type);
          
          if (!question) { 
               toast({ title: "Out of Questions!", description: `No more ${type}s available in this mode. The game might need to be restarted with different content if all preloaded questions are used.`, variant: "destructive"});
               return { ...r, currentQuestion: {id: "empty", text: `No more ${type}s!`, type}, gameState: 'awaitingAnswer'};
          }
          return {
            ...r,
            currentQuestion: question,
            gameState: 'questionRevealed',
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${r.players.find(p=>p.id === r.currentPlayerId)?.nickname} chose ${type}. Question: ${question.text}`, timestamp: new Date(), type: 'system' }]
          };
        }
        return r;
      });
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      return updatedRooms;
    });
  }, [toast]);
  
  const nextTurn = useCallback((roomId: string) => {
    setRooms(prevRooms => {
      const roomIndex = prevRooms.findIndex(r => r.id === roomId);
      if (roomIndex === -1) return prevRooms;
      
      const room = prevRooms[roomIndex];
      const nextPlayer = selectNextPlayer(room.players, room.currentPlayerId);
      
      if (!nextPlayer) {
        if (room.players.length === 0) {
          return prevRooms; 
        }
        const fallbackPlayer = room.players[0];
         const updatedRooms = prevRooms.map((r, idx) => {
          if (idx === roomIndex) {
            return {
              ...r,
              currentPlayerId: fallbackPlayer.id,
              gameState: 'playerChoosing' as GameState,
              currentQuestion: null,
              round: r.players.indexOf(fallbackPlayer) === 0 && r.round > 0 ? r.round + 1 : r.round,
              chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `Turn error, resetting. It's ${fallbackPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' as ChatMessageType}]
            };
          }
          return r;
        });
        localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
        return updatedRooms;
      }

      const updatedRooms = prevRooms.map((r, idx) => {
        if (idx === roomIndex) {
          return {
            ...r,
            currentPlayerId: nextPlayer.id,
            gameState: 'playerChoosing' as GameState,
            currentQuestion: null,
            round: r.players.indexOf(nextPlayer) === 0 && r.round > 0 ? r.round + 1 : r.round,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `It's ${nextPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange' as ChatMessageType}]
          };
        }
        return r;
      });
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      return updatedRooms;
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
          };
        }
        return r;
      });
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      // Call nextTurn outside of setRooms to ensure it uses the updated state
      // However, since nextTurn itself uses setRooms with a functional update, it's okay.
      // But for clarity and to avoid potential race conditions if nextTurn was more complex:
      // const finalRooms = updatedRooms; // If you needed to reference the immediate result of this setRooms
      // return finalRooms;
      return updatedRooms; // This is fine as nextTurn below will operate on the "next" state.
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

    // Moderation can still be useful for chat even if extreme content submission is removed
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
      const updatedRooms = prevRooms.map(r => 
        r.id === roomId 
        ? { 
            ...r, 
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderId: finalSenderId, senderNickname: finalSenderNickname, text: processedText, timestamp: new Date(), type: finalType }]
          } 
        : r
      );
      localStorage.setItem('riskyRoomsData', JSON.stringify(updatedRooms));
      return updatedRooms;
    });
  }, [rooms, toast]); 

  // addExtremeContent function removed

  const getCurrentRoom = useCallback((roomId: string) => rooms.find(r => r.id === roomId), [rooms]);
  const getPlayer = useCallback((roomId: string, playerId: string) => getCurrentRoom(roomId)?.players.find(p => p.id === playerId), [getCurrentRoom]);

  useEffect(() => {
    const savedData = localStorage.getItem('riskyRoomsData');
    if (savedData) {
      try {
        const parsedRooms: Room[] = JSON.parse(savedData).map((room: Room) => ({
          ...room,
          mode: (room.mode === 'extreme' ? 'moderate' : room.mode) as GameMode, // Convert old extreme to moderate
          lastActivity: new Date(room.lastActivity),
          chatMessages: room.chatMessages.map(msg => ({...msg, timestamp: new Date(msg.timestamp)}))
        }));
        setRooms(parsedRooms);
      } catch (e) {
        console.error("Failed to parse rooms from localStorage", e);
        localStorage.removeItem('riskyRoomsData');
      }
    }
  }, []);

   useEffect(() => {
    if (rooms.length > 0) {
        const roomsToSave = rooms.map(room => ({ ...room, lastActivity: new Date().toISOString() }));
        localStorage.setItem('riskyRoomsData', JSON.stringify(roomsToSave));
    }
  }, [rooms]);


  return (
    <GameContext.Provider value={{ 
      rooms, createRoom, joinRoom, leaveRoom, startGame, 
      selectTruthOrDare, submitAnswer, addChatMessage, // addExtremeContent removed
      getCurrentRoom, getPlayer, nextTurn, isLoadingModeration
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
