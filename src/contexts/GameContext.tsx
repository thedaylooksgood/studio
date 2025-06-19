
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType, PlayerQuestionHistory } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode, getInitialQuestions as getFallbackQuestions, selectNextPlayer } from '@/lib/gameUtils';
import { flagMessage, FlagMessageOutput } from '@/ai/flows/flag-message';
import { generateQuestion, GenerateQuestionInput } from '@/ai/flows/generate-question-flow';
import { useToast } from '@/hooks/use-toast';

interface GameContextType {
  activeRoom: Room | null;
  activeRoomId: string | null;
  setActiveRoomId: (roomId: string | null) => void;
  createRoom: (hostNickname: string, mode: GameMode) => Promise<string | null>;
  joinRoom: (roomId: string, playerNickname: string) => Promise<Player | null>;
  leaveRoom: () => Promise<void>;
  startGame: () => Promise<void>;
  selectTruthOrDare: (type: 'truth' | 'dare') => Promise<void>;
  submitAnswer: (answer: string, isDareSuccessful?: boolean) => Promise<void>;
  addChatMessage: (roomId: string, senderId: string, senderNickname: string, text: string, type?: ChatMessageType) => Promise<void>;
  getPlayer: (playerId: string) => Player | undefined;
  isLoadingModeration: boolean;
  isLoadingQuestion: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [activeRoom, setActiveRoomState] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomIdState] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const [isLoadingModeration, setIsLoadingModeration] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

  const updateActiveRoom = useCallback((room: Room | null) => {
    setActiveRoomState(room);
    if (room && room.id) {
      try {
        localStorage.setItem(`riskyRoomsActiveRoom_${room.id}`, JSON.stringify(room));
      } catch (e) {
        console.error("Error saving room to localStorage:", e);
        toast({ title: "Local Storage Error", description: "Could not save game state locally.", variant: "destructive" });
      }
    } else if (activeRoomId) {
      localStorage.removeItem(`riskyRoomsActiveRoom_${activeRoomId}`);
    }
  }, [activeRoomId, toast]);

  const setActiveRoomId = useCallback((roomId: string | null) => {
    setActiveRoomIdState(roomId);
    if (roomId) {
      try {
        const storedRoom = localStorage.getItem(`riskyRoomsActiveRoom_${roomId}`);
        if (storedRoom) {
          const parsedRoom = JSON.parse(storedRoom) as Room;
          const processedRoomData = {
            ...parsedRoom,
            chatMessages: (parsedRoom.chatMessages || []).map((msg: ChatMessage) => ({
              ...msg,
              timestamp: new Date(msg.timestamp).toISOString() 
            })),
            lastActivity: new Date(parsedRoom.lastActivity).toISOString(),
          };
          setActiveRoomState(processedRoomData);
        } else {
          setActiveRoomState(null);
        }
      } catch (e) {
        console.error("Error loading room from localStorage:", e);
        toast({ title: "Local Storage Error", description: "Could not load saved game state.", variant: "destructive" });
        setActiveRoomState(null);
      }
    } else {
      setActiveRoomState(null);
    }
  }, [toast]);
  
  useEffect(() => {
    if (activeRoomId) {
      setActiveRoomId(activeRoomId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPlayer = useCallback((playerId: string): Player | undefined => {
    return activeRoom?.players.find(p => p.id === playerId);
  }, [activeRoom]);

  const createRoom = useCallback(async (hostNickname: string, mode: GameMode): Promise<string | null> => {
    const newRoomId = generateRoomCode();
    const hostPlayerId = Date.now().toString();
    const hostPlayer: Player = { id: hostPlayerId, nickname: hostNickname, isHost: true, score: 0 };
    const fallbackContent = getFallbackQuestions(mode);
    
    const initialPlayerQuestionHistory: PlayerQuestionHistory = {
      [hostPlayer.id]: { truths: [], dares: [] }
    };

    const newRoomData: Room = {
      id: newRoomId,
      mode,
      players: [hostPlayer],
      currentPlayerId: hostPlayer.id, 
      gameState: 'waiting',
      truths: fallbackContent.truths,
      dares: fallbackContent.dares,
      currentQuestion: null,
      chatMessages: [{ id: Date.now().toString(), senderNickname: 'System', text: `${hostNickname} created the room! Mode: ${mode}. Room code: ${newRoomId}`, timestamp: new Date().toISOString(), type: 'system' }],
      hostId: hostPlayer.id,
      round: 0,
      lastActivity: new Date().toISOString(),
      playerQuestionHistory: initialPlayerQuestionHistory,
    };

    updateActiveRoom(newRoomData);
    setActiveRoomIdState(newRoomId);
    localStorage.setItem(`riskyRoomsPlayerId_${newRoomId}`, hostPlayerId);
    return newRoomId;
  }, [updateActiveRoom, toast]);

  const joinRoom = useCallback(async (roomIdToJoin: string, playerNickname: string): Promise<Player | null> => {
    let roomToJoin: Room | null = activeRoom;

    if (!roomToJoin || roomToJoin.id !== roomIdToJoin) {
      try {
        const storedRoom = localStorage.getItem(`riskyRoomsActiveRoom_${roomIdToJoin}`);
        if (storedRoom) {
          roomToJoin = JSON.parse(storedRoom) as Room;
          if (activeRoomId !== roomIdToJoin) setActiveRoomIdState(roomIdToJoin);
          updateActiveRoom(roomToJoin); 
        } else {
          toast({ title: "Error", description: "Room not found in local storage.", variant: "destructive" });
          return null;
        }
      } catch (e) {
         toast({ title: "Error", description: "Failed to load room data to join.", variant: "destructive" });
         return null;
      }
    }
    
    if (!roomToJoin || roomToJoin.id !== roomIdToJoin) {
        toast({ title: "Error", description: "Room not available for joining.", variant: "destructive" });
        return null;
    }

    if (roomToJoin.players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase())) {
      toast({ title: "Error", description: "Nickname already taken in this room.", variant: "destructive" });
      return null;
    }

    const newPlayerId = Date.now().toString();
    const newPlayer: Player = { id: newPlayerId, nickname: playerNickname, isHost: false, score: 0 };
    
    const updatedRoom = { ...roomToJoin };
    updatedRoom.players = [...updatedRoom.players, newPlayer];
    updatedRoom.chatMessages = [...(updatedRoom.chatMessages || []), { id: Date.now().toString(), senderNickname: 'System', text: `${playerNickname} joined the room!`, timestamp: new Date().toISOString(), type: 'playerJoin'}];
    updatedRoom.playerQuestionHistory = {
      ...(updatedRoom.playerQuestionHistory || {}), // Ensure playerQuestionHistory exists
      [newPlayer.id]: { truths: [], dares: [] }
    };
    updatedRoom.lastActivity = new Date().toISOString();
    
    updateActiveRoom(updatedRoom);
    localStorage.setItem(`riskyRoomsPlayerId_${roomIdToJoin}`, newPlayerId);
    return newPlayer;
  }, [activeRoom, activeRoomId, updateActiveRoom, toast]);

  const leaveRoom = useCallback(async () => {
    if (!activeRoom || !activeRoomId) {
      router.push('/');
      return;
    }

    const localPlayerId = localStorage.getItem(`riskyRoomsPlayerId_${activeRoomId}`);
    if (!localPlayerId) {
      router.push('/');
      return;
    }

    const playerLeaving = activeRoom.players.find(p => p.id === localPlayerId);
    if (!playerLeaving) {
       router.push('/');
       return;
    }

    const remainingPlayers = activeRoom.players.filter(p => p.id !== localPlayerId);
    localStorage.removeItem(`riskyRoomsPlayerId_${activeRoomId}`);

    if (remainingPlayers.length === 0) {
      localStorage.removeItem(`riskyRoomsActiveRoom_${activeRoomId}`);
      updateActiveRoom(null);
      setActiveRoomIdState(null);
      toast({ title: "Room Closed", description: "The last player left, room closed." });
      router.push('/');
      return;
    }
    
    const updatedRoom = { ...activeRoom };
    updatedRoom.players = remainingPlayers;
    
    let newHostId = updatedRoom.hostId;
    if (updatedRoom.hostId === localPlayerId && remainingPlayers.length > 0) {
      newHostId = remainingPlayers[0].id;
      updatedRoom.hostId = newHostId;
      updatedRoom.players = remainingPlayers.map(p => p.id === newHostId ? { ...p, isHost: true } : p);
    }
    
    let turnChangeMessage: ChatMessage | null = null;
    if (updatedRoom.currentPlayerId === localPlayerId && updatedRoom.gameState !== 'waiting' && updatedRoom.gameState !== 'gameOver') {
      const nextPlayerAfterLeave = selectNextPlayer(remainingPlayers, null); 
      updatedRoom.currentPlayerId = nextPlayerAfterLeave?.id || remainingPlayers[0]?.id || null;
      
      if (updatedRoom.currentPlayerId) {
        updatedRoom.gameState = 'playerChoosing';
        updatedRoom.currentQuestion = null;
        const nextPlayerNickname = remainingPlayers.find(p => p.id === updatedRoom.currentPlayerId)?.nickname || 'Next Player';
        turnChangeMessage = { id: (Date.now() + 1).toString(), senderNickname: 'System', text: `It's now ${nextPlayerNickname}'s turn. Choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' };
      } else {
        updatedRoom.gameState = 'gameOver';
      }
    }
    
    const leaveMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `${playerLeaving.nickname} left the room. ${newHostId !== activeRoom.hostId && updatedRoom.hostId ? `${remainingPlayers.find(p => p.id === updatedRoom.hostId)?.nickname} is the new host.` : ''}`, timestamp: new Date().toISOString(), type: 'playerLeave' };
    let newChatMessages = [...(updatedRoom.chatMessages || []), leaveMessage];
    if (turnChangeMessage) newChatMessages.push(turnChangeMessage);
    updatedRoom.chatMessages = newChatMessages;
    
    const newPlayerQuestionHistory = { ...updatedRoom.playerQuestionHistory };
    if (localPlayerId) delete newPlayerQuestionHistory[localPlayerId];
    updatedRoom.playerQuestionHistory = newPlayerQuestionHistory;
    updatedRoom.lastActivity = new Date().toISOString();

    updateActiveRoom(updatedRoom);
    toast({ title: "Left Room", description: "You have left the game room." });
    router.push('/');

  }, [activeRoom, activeRoomId, updateActiveRoom, toast, router]);

  const startGame = useCallback(async () => {
    if (!activeRoom || activeRoom.gameState !== 'waiting') return;
    if (activeRoom.players.length < 1) {
      toast({ title: "Cannot Start Game", description: "Need at least 1 player to start.", variant: "destructive" });
      return;
    }

    const firstPlayer = activeRoom.players[Math.floor(Math.random() * activeRoom.players.length)];
    const updatedRoom = {
      ...activeRoom,
      gameState: 'playerChoosing' as GameState,
      currentPlayerId: firstPlayer.id,
      round: 1,
      lastActivity: new Date().toISOString(),
      chatMessages: [
        ...(activeRoom.chatMessages || []),
        { id: Date.now().toString(), senderNickname: 'System', text: `Game started! It's ${firstPlayer.nickname}'s turn.`, timestamp: new Date().toISOString(), type: 'system' as ChatMessageType },
        { id: (Date.now() + 1).toString(), senderNickname: 'System', text: `${firstPlayer.nickname}, choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' as ChatMessageType }
      ],
    };
    updateActiveRoom(updatedRoom);
  }, [activeRoom, updateActiveRoom, toast]);

  const nextTurn = useCallback(async () => {
    if (!activeRoom || activeRoom.players.length === 0) return;

    const nextPlayer = selectNextPlayer(activeRoom.players, activeRoom.currentPlayerId);
    if (!nextPlayer) {
      updateActiveRoom({ 
          ...activeRoom,
          gameState: 'gameOver', 
          chatMessages: [...(activeRoom.chatMessages || []), {id: Date.now().toString(), senderNickname: "System", text: "Game Over! Could not determine next player.", timestamp: new Date().toISOString(), type: 'system'}],
          lastActivity: new Date().toISOString()
      });
      return;
    }

    let newRound = activeRoom.round;
    const currentPlayerIndex = activeRoom.players.findIndex(p => p.id === activeRoom.currentPlayerId);
    const nextPlayerIndex = activeRoom.players.findIndex(p => p.id === nextPlayer.id);

    if (nextPlayerIndex < currentPlayerIndex && activeRoom.round > 0) {
      newRound = activeRoom.round + 1;
    }
    
    const updatedRoom = {
      ...activeRoom,
      currentPlayerId: nextPlayer.id,
      gameState: 'playerChoosing' as GameState,
      currentQuestion: null,
      round: newRound,
      chatMessages: [...(activeRoom.chatMessages || []), { id: Date.now().toString(), senderNickname: 'System', text: `It's ${nextPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' as ChatMessageType }],
      lastActivity: new Date().toISOString()
    };
    updateActiveRoom(updatedRoom);
  }, [activeRoom, updateActiveRoom]);

  const selectTruthOrDare = useCallback(async (type: 'truth' | 'dare') => {
    if (!activeRoom || !activeRoom.currentPlayerId || activeRoom.gameState !== 'playerChoosing') {
      toast({ title: "Error", description: "Cannot select truth or dare at this time.", variant: "destructive" });
      return;
    }
    
    const currentPlayer = activeRoom.players.find(p => p.id === activeRoom.currentPlayerId);
    if (!currentPlayer) {
       toast({ title: "Error", description: "Current player not found.", variant: "destructive" });
       return;
    }
    
    setIsLoadingQuestion(true);
    let questionText: string | null = null;
    let questionId = `ai-${Date.now()}`;
    const playerHistory = activeRoom.playerQuestionHistory?.[currentPlayer.id] || { truths: [], dares: [] };
    const askedQuestionsForPlayer = playerHistory[type === 'truth' ? 'truths' : 'dares'] || [];

    try {
      const aiInput: GenerateQuestionInput = {
        gameMode: activeRoom.mode, 
        questionType: type,
        playerNickname: currentPlayer.nickname,
        askedQuestions: askedQuestionsForPlayer,
      };
      console.log('[GameContext] Attempting AI Question Generation with input:', JSON.stringify(aiInput, null, 2));
      const aiResponse = await generateQuestion(aiInput);
      console.log('[GameContext] AI Response:', aiResponse);
      questionText = aiResponse.questionText;
    } catch (error: any) {
      console.error("[GameContext] AI Question Generation Error Caught:", error);
      if (error.message) {
        console.error("[GameContext] AI Error Message:", error.message);
      }
      if (error.stack) {
        console.error("[GameContext] AI Error Stack:", error.stack);
      }
      toast({ title: "AI Error", description: "AI failed to generate question. Using fallback.", variant: "destructive" });
      const fallbackPool = type === 'truth' ? activeRoom.truths : activeRoom.dares;
      const availableFallbacks = fallbackPool.filter(q => !askedQuestionsForPlayer.includes(q.text));
      if (availableFallbacks.length > 0) {
        const fallbackQ = availableFallbacks[Math.floor(Math.random() * availableFallbacks.length)];
        questionText = fallbackQ.text;
        questionId = fallbackQ.id;
      } else {
        questionText = type === 'truth' ? "No more truths for you! You're an open book... or the AI is stumped." : "No more dares for you! You're too wild... or the AI is stumped.";
        questionId = `fallback-exhausted-${Date.now()}`;
      }
    }

    if (!questionText) {
      toast({ title: "Error", description: "Failed to get a question text.", variant: "destructive" });
      setIsLoadingQuestion(false);
      return;
    }

    const newQuestion: Question = { id: questionId, text: questionText, type };
    
    const updatedPlayerHistory = {
      ...activeRoom.playerQuestionHistory,
      [currentPlayer.id]: {
        ...(activeRoom.playerQuestionHistory?.[currentPlayer.id] || { truths: [], dares: [] }),
        [type === 'truth' ? 'truths' : 'dares']: [...(activeRoom.playerQuestionHistory?.[currentPlayer.id]?.[type === 'truth' ? 'truths' : 'dares'] || []), newQuestion.text]
      }
    };

    const systemMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `${currentPlayer.nickname} chose ${type}. Question: ${newQuestion.text}`, timestamp: new Date().toISOString(), type: 'system' };
    
    const updatedRoom = {
      ...activeRoom,
      currentQuestion: newQuestion,
      gameState: 'questionRevealed' as GameState,
      lastActivity: new Date().toISOString(),
      playerQuestionHistory: updatedPlayerHistory,
      chatMessages: [...(activeRoom.chatMessages || []), systemMessage],
    };
    
    updateActiveRoom(updatedRoom);
    setIsLoadingQuestion(false);
  }, [activeRoom, updateActiveRoom, toast, setIsLoadingQuestion]);

  const submitAnswer = useCallback(async (answer: string, isDareSuccessful?: boolean) => {
    if (!activeRoom || !activeRoom.currentPlayerId || activeRoom.currentQuestion == null || (activeRoom.gameState !== 'questionRevealed' && activeRoom.gameState !== 'awaitingAnswer')) {
        toast({ title: "Error", description: "Cannot submit answer at this time.", variant: "destructive"});
        return;
    }

    const player = activeRoom.players.find(p => p.id === activeRoom.currentPlayerId);
    if (!player) return;

    const messageType = activeRoom.currentQuestion.type === 'truth' ? 'truthAnswer' : 'dareResult';
    const formattedAnswer = activeRoom.currentQuestion.type === 'dare' ? `${isDareSuccessful ? '✅ Completed:' : '❌ Failed:'} ${answer}` : answer;

    let updatedPlayers = activeRoom.players;
    if (activeRoom.currentQuestion.type === 'dare' && isDareSuccessful) {
      updatedPlayers = activeRoom.players.map(p => 
        p.id === player.id ? { ...p, score: p.score + 1 } : p
      );
    }
    
    const newChatMessage: ChatMessage = { id: Date.now().toString(), senderId: player.id, senderNickname: player.nickname, text: formattedAnswer, timestamp: new Date().toISOString(), type: messageType };
    
    const updatedRoom = {
      ...activeRoom,
      players: updatedPlayers,
      chatMessages: [...(activeRoom.chatMessages || []), newChatMessage],
      // currentQuestion: null, // Keep currentQuestion until nextTurn explicitly clears it or sets a new one
      gameState: 'awaitingAnswer' as GameState, // Transition state before nextTurn
      lastActivity: new Date().toISOString(),
    };
    
    updateActiveRoom(updatedRoom);
    await nextTurn();

  }, [activeRoom, updateActiveRoom, toast, nextTurn]);

  const addChatMessage = useCallback(async (chatRoomId: string, senderId: string, senderNickname: string, text: string, type: ChatMessageType = 'message') => {
    if (!activeRoom || chatRoomId !== activeRoom.id) {
        toast({title: "Chat Error", description: "Not in a valid room to chat.", variant: "destructive"});
        return;
    }

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
      toast({ title: "Moderation Error", description: "Could not process message moderation. Message sent as is.", variant: "destructive" });
    } finally {
      setIsLoadingModeration(false);
    }

    const newChatMessage: ChatMessage = { id: Date.now().toString(), senderId: finalSenderId, senderNickname: finalSenderNickname, text: processedText, timestamp: new Date().toISOString(), type: finalType };
    
    const updatedRoom = {
      ...activeRoom,
      chatMessages: [...(activeRoom.chatMessages || []), newChatMessage],
      lastActivity: new Date().toISOString(),
    };
    updateActiveRoom(updatedRoom);

  }, [activeRoom, updateActiveRoom, toast, setIsLoadingModeration]);

  return (
    <GameContext.Provider value={{
      activeRoom, activeRoomId, setActiveRoomId,
      createRoom, joinRoom, leaveRoom, startGame,
      selectTruthOrDare, submitAnswer, addChatMessage,
      getPlayer, isLoadingModeration, isLoadingQuestion
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

