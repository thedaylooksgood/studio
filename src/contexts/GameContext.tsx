
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { generateRoomCode, getInitialQuestions, selectNextPlayer, getRandomQuestion } from '@/lib/gameUtils';
import { flagMessage, FlagMessageInput, FlagMessageOutput } from '@/ai/flows/flag-message';
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
  addExtremeContent: (roomId: string, playerId: string, type: 'truth' | 'dare', text: string) => Promise<{success: boolean, message: string}>;
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
    setRooms(prevRooms => [...prevRooms, newRoom]);
    return newRoomId;
  }, []);

  const joinRoom = useCallback((roomId: string, playerNickname: string): Player | null => {
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) {
      toast({ title: "Error", description: "Room not found.", variant: "destructive" });
      return null;
    }
    if (rooms[roomIndex].players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase())) {
      toast({ title: "Error", description: "Nickname already taken in this room.", variant: "destructive" });
      return null;
    }
    if (rooms[roomIndex].gameState !== 'waiting') {
         toast({ title: "Error", description: "Game already in progress.", variant: "destructive" });
         return null;
    }


    const newPlayer: Player = { id: Date.now().toString(), nickname: playerNickname, isHost: false, score: 0 };
    
    setRooms(prevRooms => prevRooms.map(r => 
      r.id === roomId 
      ? { 
          ...r, 
          players: [...r.players, newPlayer],
          chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${playerNickname} joined the room!`, timestamp: new Date(), type: 'playerJoin'}]
        } 
      : r
    ));
    return newPlayer;
  }, [rooms, toast]);

  const leaveRoom = useCallback((roomId: string, playerId: string) => {
    setRooms(prevRooms => {
      const room = prevRooms.find(r => r.id === roomId);
      if (!room) return prevRooms;

      const player = room.players.find(p => p.id === playerId);
      const remainingPlayers = room.players.filter(p => p.id !== playerId);
      
      if (remainingPlayers.length === 0) {
        // Remove room if empty
        return prevRooms.filter(r => r.id !== roomId);
      }

      let newCurrentPlayerId = room.currentPlayerId;
      let newHostId = room.hostId;

      if (room.currentPlayerId === playerId) {
        newCurrentPlayerId = selectNextPlayer(remainingPlayers, null)?.id || null;
      }
      if (room.hostId === playerId && remainingPlayers.length > 0) {
        newHostId = remainingPlayers[0].id; // Assign new host
        remainingPlayers[0].isHost = true;
      }
      
      return prevRooms.map(r => 
        r.id === roomId 
        ? { 
            ...r, 
            players: remainingPlayers.map(p => p.id === newHostId ? {...p, isHost: true} : p),
            currentPlayerId: newCurrentPlayerId,
            hostId: newHostId,
            chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${player?.nickname || 'A player'} left the room.`, timestamp: new Date(), type: 'playerLeave'}]
          } 
        : r
      );
    });
  }, []);


  const startGame = useCallback((roomId: string) => {
    setRooms(prevRooms => prevRooms.map(r => {
      if (r.id === roomId) {
        if (r.players.length < 2) {
          toast({ title: "Cannot Start Game", description: "Need at least 2 players to start.", variant: "destructive" });
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
    }));
  }, [toast]);

  const selectTruthOrDare = useCallback((roomId: string, type: 'truth' | 'dare') => {
    setRooms(prevRooms => prevRooms.map(r => {
      if (r.id === roomId && r.gameState === 'playerChoosing') {
        const questions = type === 'truth' ? r.truths : r.dares;
        const question = getRandomQuestion(questions, type);
        if (!question && r.mode === 'extreme' && questions.length === 0) {
             toast({ title: "No questions", description: `No ${type}s available. Add some first!`, variant: "destructive"});
             return r; // Stay in playerChoosing state
        }
        if (!question) { // Should only happen if preloaded content runs out, or extreme mode has no content
             toast({ title: "Out of Questions!", description: `No more ${type}s available in this mode. Try adding some if in Extreme mode, or restart.`, variant: "destructive"});
             return { ...r, currentQuestion: {id: "empty", text: `No more ${type}s! Please add more or end game.`, type}, gameState: 'awaitingAnswer'};
        }
        return {
          ...r,
          currentQuestion: question,
          gameState: 'questionRevealed',
          chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${r.players.find(p=>p.id === r.currentPlayerId)?.nickname} chose ${type}. Question: ${question.text}`, timestamp: new Date(), type: 'system' }]
        };
      }
      return r;
    }));
  }, [toast]);
  
  const submitAnswer = useCallback((roomId: string, answer: string, isDareSuccessful?: boolean) => {
    setRooms(prevRooms => prevRooms.map(r => {
      if (r.id === roomId && (r.gameState === 'questionRevealed' || r.gameState === 'awaitingAnswer')) {
        const player = r.players.find(p => p.id === r.currentPlayerId);
        const messageType = r.currentQuestion?.type === 'truth' ? 'truthAnswer' : 'dareResult';
        const formattedAnswer = r.currentQuestion?.type === 'dare' ? `${isDareSuccessful ? '✅ Completed:' : '❌ Failed:'} ${answer}` : answer;
        
        // Update player score for dares
        let updatedPlayers = r.players;
        if (r.currentQuestion?.type === 'dare' && player) {
            updatedPlayers = r.players.map(p => p.id === player.id ? {...p, score: p.score + (isDareSuccessful ? 1 : 0)} : p);
        }

        return {
          ...r,
          players: updatedPlayers,
          gameState: 'playerChoosing', // Ready for next player or same player to choose next turn logic
          chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderId: player?.id, senderNickname: player?.nickname || 'Player', text: formattedAnswer, timestamp: new Date(), type: messageType }],
          currentQuestion: null, // Clear current question
          // currentPlayerId will be set by nextTurn
        };
      }
      return r;
    }));
    // Automatically move to next turn after submission
    nextTurn(roomId);
  }, []);


  const nextTurn = useCallback((roomId: string) => {
    setRooms(prevRooms => prevRooms.map(r => {
      if (r.id === roomId) {
        const nextPlayer = selectNextPlayer(r.players, r.currentPlayerId);
        if (!nextPlayer) return r; // Should not happen if players > 0
        
        return {
          ...r,
          currentPlayerId: nextPlayer.id,
          gameState: 'playerChoosing',
          currentQuestion: null,
          round: r.players.indexOf(nextPlayer) === 0 ? r.round + 1 : r.round, // Increment round if it's the first player's turn again
          chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `It's ${nextPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date(), type: 'turnChange'}]
        };
      }
      return r;
    }));
  }, []);


  const addChatMessage = useCallback(async (roomId: string, senderId: string, senderNickname: string, text: string, type: ChatMessageType = 'message') => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    let processedText = text;
    let isFlagged = false;

    if (room.mode === 'extreme') {
      setIsLoadingModeration(true);
      try {
        const moderationResult: FlagMessageOutput = await flagMessage({ messageText: text });
        if (moderationResult.flagged) {
          processedText = `Message from ${senderNickname} was flagged: ${moderationResult.reason}`;
          senderNickname = 'System'; // Attribute to system
          type = 'system';
          isFlagged = true;
          toast({ title: "Content Moderated", description: `Your message was flagged: ${moderationResult.reason}`, variant: "destructive" });
        }
      } catch (error) {
        console.error("Moderation error:", error);
        toast({ title: "Moderation Error", description: "Could not process message moderation.", variant: "destructive" });
      } finally {
        setIsLoadingModeration(false);
      }
    }

    // If not flagged or not extreme mode, add original/processed message
    setRooms(prevRooms => prevRooms.map(r => 
      r.id === roomId 
      ? { 
          ...r, 
          chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderId: isFlagged ? undefined : senderId, senderNickname, text: processedText, timestamp: new Date(), type }]
        } 
      : r
    ));
  }, [rooms, toast]);

  const addExtremeContent = useCallback(async (roomId: string, playerId: string, type: 'truth' | 'dare', text: string): Promise<{success: boolean, message: string}> => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.mode !== 'extreme') {
      return {success: false, message: "Can only add content in Extreme mode."};
    }
    
    setIsLoadingModeration(true);
    try {
      const moderationResult: FlagMessageOutput = await flagMessage({ messageText: text });
      if (moderationResult.flagged) {
        setIsLoadingModeration(false);
        toast({ title: "Content Moderated", description: `Your submission was flagged: ${moderationResult.reason}`, variant: "destructive" });
        return {success: false, message: `Submission flagged: ${moderationResult.reason}`};
      }
    } catch (error) {
      console.error("Moderation error:", error);
      setIsLoadingModeration(false);
      toast({ title: "Moderation Error", description: "Could not process content moderation.", variant: "destructive" });
      return {success: false, message: "Moderation error."};
    }
    setIsLoadingModeration(false);

    const newQuestion: Question = { id: `user-${type}-${Date.now()}`, text, type, submittedBy: playerId, isUserSubmitted: true };
    setRooms(prevRooms => prevRooms.map(r => {
      if (r.id === roomId) {
        const updatedQuestions = type === 'truth' ? [...r.truths, newQuestion] : [...r.dares, newQuestion];
        return {
          ...r,
          [type === 'truth' ? 'truths' : 'dares']: updatedQuestions,
          chatMessages: [...r.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `${r.players.find(p => p.id === playerId)?.nickname} added a new ${type}.`, timestamp: new Date(), type: 'system' }]
        };
      }
      return r;
    }));
    toast({ title: "Content Added", description: `Your ${type} has been added to the game!`});
    return {success: true, message: `${type} added successfully.`};
  }, [rooms, toast]);

  const getCurrentRoom = useCallback((roomId: string) => rooms.find(r => r.id === roomId), [rooms]);
  const getPlayer = useCallback((roomId: string, playerId: string) => getCurrentRoom(roomId)?.players.find(p => p.id === playerId), [getCurrentRoom]);

  // Auto-remove rooms inactive for too long (e.g., 6 hours) - basic version
  useEffect(() => {
    const interval = setInterval(() => {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      setRooms(prevRooms => prevRooms.filter(room => room.lastActivity > sixHoursAgo));
    }, 60 * 60 * 1000); // Check every hour
    return () => clearInterval(interval);
  }, []);

  // Update lastActivity on any change to rooms (simplification)
  useEffect(() => {
    setRooms(prevRooms => prevRooms.map(room => ({ ...room, lastActivity: new Date() })));
  }, [rooms.length, rooms.map(r => r.players.length).join(), rooms.map(r => r.chatMessages.length).join()]);


  return (
    <GameContext.Provider value={{ 
      rooms, createRoom, joinRoom, leaveRoom, startGame, 
      selectTruthOrDare, submitAnswer, addChatMessage, addExtremeContent, 
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
