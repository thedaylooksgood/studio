
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType, PlayerQuestionHistory } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode, getInitialQuestions as getFallbackQuestions, selectNextPlayer } from '@/lib/gameUtils';
import { flagMessage, FlagMessageOutput } from '@/ai/flows/flag-message';
import { generateQuestion, GenerateQuestionInput } from '@/ai/flows/generate-question-flow';
import { useToast } from '@/hooks/use-toast';
import { database } from '@/lib/firebase';
import { ref, set, onValue, update, remove, off, get, serverTimestamp } from 'firebase/database';

interface GameContextType {
  activeRoom: Room | null;
  activeRoomId: string | null;
  setActiveRoomId: (roomId: string | null) => void;
  createRoom: (hostNickname: string, mode: GameMode) => Promise<string | null>;
  joinRoom: (roomId: string, playerNickname: string) => Promise<Player | null>;
  leaveRoom: () => Promise<void>; // Simplified, operates on activeRoom
  startGame: () => Promise<void>; // Simplified
  selectTruthOrDare: (type: 'truth' | 'dare') => Promise<void>; // Simplified
  submitAnswer: (answer: string, isDareSuccessful?: boolean) => Promise<void>; // Simplified
  addChatMessage: (senderId: string, senderNickname: string, text: string, type?: ChatMessageType) => Promise<void>; // Simplified
  getPlayer: (playerId: string) => Player | undefined; // Operates on activeRoom
  isLoadingModeration: boolean;
  isLoadingQuestion: boolean;
  isLoadingRoom: boolean;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomIdState] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const [isLoadingModeration, setIsLoadingModeration] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const roomListenerRef = useRef<any>(null);


  const setActiveRoomId = useCallback((roomId: string | null) => {
    setIsLoadingRoom(true);
    setActiveRoom(null); // Clear previous room data
    if (roomListenerRef.current && activeRoomId) {
        const oldRoomRef = ref(database, `rooms/${activeRoomId}`);
        off(oldRoomRef, 'value', roomListenerRef.current);
        roomListenerRef.current = null;
    }
    setActiveRoomIdState(roomId);
  }, [activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) {
      setActiveRoom(null);
      setIsLoadingRoom(false);
      return;
    }

    setIsLoadingRoom(true);
    const roomRef = ref(database, `rooms/${activeRoomId}`);
    
    roomListenerRef.current = onValue(roomRef, (snapshot) => {
      const roomData = snapshot.val();
      if (roomData) {
        // Convert chat message timestamps if necessary
        const processedRoomData = {
          ...roomData,
          chatMessages: (roomData.chatMessages || []).map((msg: ChatMessage) => ({
            ...msg,
            timestamp: new Date(msg.timestamp).toISOString() // Ensure it's a string for consistency
          })),
          lastActivity: new Date(roomData.lastActivity).toISOString(),
        };
        setActiveRoom(processedRoomData as Room);
      } else {
        setActiveRoom(null);
        // Potentially toast that room doesn't exist or was removed
        // toast({ title: "Room Disconnected", description: "The room you were in is no longer available.", variant: "destructive" });
        // router.push('/'); // Or handle differently
      }
      setIsLoadingRoom(false);
    }, (error) => {
      console.error("Firebase read failed: " + error.message);
      toast({ title: "Connection Error", description: "Failed to connect to the game room.", variant: "destructive" });
      setIsLoadingRoom(false);
      setActiveRoom(null);
    });

    return () => {
      if (roomListenerRef.current) {
        off(roomRef, 'value', roomListenerRef.current);
        roomListenerRef.current = null;
      }
    };
  }, [activeRoomId, toast, router]);


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
      truths: fallbackContent.truths, // Storing for potential fallback use, not primary
      dares: fallbackContent.dares,   // Storing for potential fallback use
      currentQuestion: null,
      chatMessages: [{ id: Date.now().toString(), senderNickname: 'System', text: `${hostNickname} created the room! Mode: ${mode}. Room code: ${newRoomId}`, timestamp: new Date().toISOString(), type: 'system' }],
      hostId: hostPlayer.id,
      round: 0,
      lastActivity: new Date().toISOString(), // serverTimestamp() is better here
      playerQuestionHistory: initialPlayerQuestionHistory,
    };

    try {
      const roomRef = ref(database, `rooms/${newRoomId}`);
      await set(roomRef, newRoomData);
      // setActiveRoomIdState(newRoomId); // Listener will pick it up, no need to set activeRoom directly
      return newRoomId;
    } catch (error) {
      console.error("Error creating room in RTDB:", error);
      toast({ title: "Error Creating Room", description: "Could not save room to database.", variant: "destructive" });
      return null;
    }
  }, [toast]);

  const joinRoom = useCallback(async (roomIdToJoin: string, playerNickname: string): Promise<Player | null> => {
    const roomRef = ref(database, `rooms/${roomIdToJoin}`);
    try {
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) {
        toast({ title: "Error", description: "Room not found.", variant: "destructive" });
        return null;
      }

      const currentRoomData = snapshot.val() as Room;
      if (currentRoomData.players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase())) {
        toast({ title: "Error", description: "Nickname already taken in this room.", variant: "destructive" });
        return null;
      }

      const newPlayerId = Date.now().toString();
      const newPlayer: Player = { id: newPlayerId, nickname: playerNickname, isHost: false, score: 0 };
      
      const updates: any = {};
      const playerPath = `players/${currentRoomData.players.length}`; // Add to end of players array
      updates[playerPath] = newPlayer;
      
      const chatMessageId = Date.now().toString();
      const chatMessagePath = `chatMessages/${currentRoomData.chatMessages.length}`;
      updates[chatMessagePath] = { id: chatMessageId, senderNickname: 'System', text: `${playerNickname} joined the room!`, timestamp: new Date().toISOString(), type: 'playerJoin'};
      
      const playerHistoryPath = `playerQuestionHistory/${newPlayerId}`;
      updates[playerHistoryPath] = { truths: [], dares: [] };
      updates['lastActivity'] = new Date().toISOString();


      await update(roomRef, updates);
      // setActiveRoomIdState(roomIdToJoin); // Let navigation trigger this
      return newPlayer;

    } catch (error) {
      console.error("Error joining room:", error);
      toast({ title: "Join Error", description: "Could not join the room.", variant: "destructive" });
      return null;
    }
  }, [toast]);

  const leaveRoom = useCallback(async () => {
    if (!activeRoom || !activeRoomId) return;

    const localPlayerId = localStorage.getItem(`riskyRoomsPlayerId_${activeRoomId}`);
    if (!localPlayerId) return;

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    
    try {
      // Fetch current room state to make decisions
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) return; // Room already gone

      let currentRoomData = snapshot.val() as Room;
      const playerLeaving = currentRoomData.players.find(p => p.id === localPlayerId);
      if (!playerLeaving) return;

      const remainingPlayers = currentRoomData.players.filter(p => p.id !== localPlayerId);

      if (remainingPlayers.length === 0) {
        await remove(roomRef);
        toast({ title: "Room Closed", description: "The last player left, room closed." });
        setActiveRoomIdState(null); // Clear active room
        router.push('/');
        return;
      }
      
      const updates: any = {};
      updates.players = remainingPlayers;
      
      let newHostId = currentRoomData.hostId;
      if (currentRoomData.hostId === localPlayerId) {
        newHostId = remainingPlayers[0].id;
        updates.hostId = newHostId;
        // Ensure the new host player object reflects isHost: true
        updates.players = remainingPlayers.map(p => p.id === newHostId ? { ...p, isHost: true } : p);
      }
      
      let newCurrentPlayerId = currentRoomData.currentPlayerId;
      let newGameState = currentRoomData.gameState;
      let newCurrentQuestion = currentRoomData.currentQuestion;
      let turnChangeMessage: ChatMessage | null = null;

      if (currentRoomData.currentPlayerId === localPlayerId && currentRoomData.gameState !== 'waiting' && currentRoomData.gameState !== 'gameOver') {
        const nextPlayerAfterLeave = selectNextPlayer(remainingPlayers, null); // Pass remaining players
        newCurrentPlayerId = nextPlayerAfterLeave?.id || remainingPlayers[0]?.id || null;
        
        if (newCurrentPlayerId) {
          newGameState = 'playerChoosing';
          newCurrentQuestion = null;
          const nextPlayerNickname = remainingPlayers.find(p => p.id === newCurrentPlayerId)?.nickname || 'Next Player';
          turnChangeMessage = { id: (Date.now() + 1).toString(), senderNickname: 'System', text: `It's now ${nextPlayerNickname}'s turn. Choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' };
        } else {
          newGameState = 'gameOver';
        }
        updates.currentPlayerId = newCurrentPlayerId;
        updates.gameState = newGameState;
        updates.currentQuestion = newCurrentQuestion;
      }
      
      const leaveMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `${playerLeaving.nickname} left the room. ${newHostId !== currentRoomData.hostId ? `${remainingPlayers.find(p => p.id === newHostId)?.nickname} is the new host.` : ''}`, timestamp: new Date().toISOString(), type: 'playerLeave' };
      updates.chatMessages = [...currentRoomData.chatMessages, leaveMessage];
      if (turnChangeMessage) {
        updates.chatMessages.push(turnChangeMessage);
      }
      
      const newPlayerQuestionHistory = { ...currentRoomData.playerQuestionHistory };
      delete newPlayerQuestionHistory[localPlayerId];
      updates.playerQuestionHistory = newPlayerQuestionHistory;
      updates.lastActivity = new Date().toISOString();

      await update(roomRef, updates);
      // If the current user is the one leaving:
      if (localPlayerId === (getPlayer(localPlayerId)?.id)) { // Check if it was this user
         setActiveRoomIdState(null); // Stop listening
         router.push('/');
      }

    } catch (error) {
      console.error("Error leaving room:", error);
      toast({ title: "Leave Error", description: "Could not leave the room.", variant: "destructive" });
    }
  }, [activeRoom, activeRoomId, toast, router, getPlayer]);

  const startGame = useCallback(async () => {
    if (!activeRoom || !activeRoomId || activeRoom.gameState !== 'waiting') return;
    if (activeRoom.players.length < 1) {
      toast({ title: "Cannot Start Game", description: "Need at least 1 player to start.", variant: "destructive" });
      return;
    }

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    try {
      const firstPlayer = activeRoom.players[Math.floor(Math.random() * activeRoom.players.length)];
      const updates: any = {};
      updates.gameState = 'playerChoosing';
      updates.currentPlayerId = firstPlayer.id;
      updates.round = 1;
      updates.lastActivity = new Date().toISOString();
      
      const startMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `Game started! It's ${firstPlayer.nickname}'s turn.`, timestamp: new Date().toISOString(), type: 'system' };
      const turnMessage: ChatMessage = { id: (Date.now() + 1).toString(), senderNickname: 'System', text: `${firstPlayer.nickname}, choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' };
      updates.chatMessages = [...activeRoom.chatMessages, startMessage, turnMessage];

      await update(roomRef, updates);

    } catch (error) {
      console.error("Error starting game:", error);
      toast({ title: "Start Game Error", description: "Could not start the game.", variant: "destructive" });
    }
  }, [activeRoom, activeRoomId, toast]);

  const nextTurn = useCallback(async () => {
    if (!activeRoom || !activeRoomId || activeRoom.players.length === 0) return;

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    try {
      const nextPlayer = selectNextPlayer(activeRoom.players, activeRoom.currentPlayerId);
      if (!nextPlayer) {
        await update(roomRef, { 
            gameState: 'gameOver', 
            chatMessages: [...activeRoom.chatMessages, {id: Date.now().toString(), senderNickname: "System", text: "Game Over! Could not determine next player.", timestamp: new Date().toISOString(), type: 'system'}],
            lastActivity: new Date().toISOString()
        });
        return;
      }

      let newRound = activeRoom.round;
      if (activeRoom.players.indexOf(nextPlayer) === 0 && activeRoom.currentPlayerId !== nextPlayer.id && activeRoom.round > 0) {
        newRound = activeRoom.round + 1;
      }
      
      const updates: any = {
        currentPlayerId: nextPlayer.id,
        gameState: 'playerChoosing',
        currentQuestion: null,
        round: newRound,
        chatMessages: [...activeRoom.chatMessages, { id: Date.now().toString(), senderNickname: 'System', text: `It's ${nextPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' }],
        lastActivity: new Date().toISOString()
      };
      await update(roomRef, updates);

    } catch (error) {
      console.error("Error advancing turn:", error);
      toast({ title: "Next Turn Error", description: "Could not advance to the next turn.", variant: "destructive" });
    }
  }, [activeRoom, activeRoomId, toast]);


  const selectTruthOrDare = useCallback(async (type: 'truth' | 'dare') => {
    if (!activeRoom || !activeRoomId || !activeRoom.currentPlayerId || activeRoom.gameState !== 'playerChoosing') {
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
    const askedQuestionsForPlayer = activeRoom.playerQuestionHistory[currentPlayer.id]?.[type] || [];

    try {
      const aiInput: GenerateQuestionInput = {
        gameMode: activeRoom.mode,
        questionType: type,
        playerNickname: currentPlayer.nickname,
        askedQuestions: askedQuestionsForPlayer,
      };
      const aiResponse = await generateQuestion(aiInput);
      questionText = aiResponse.questionText;
    } catch (error) {
      console.error("AI Question Generation Error:", error);
      toast({ title: "AI Error", description: "AI failed. Using fallback.", variant: "destructive" });
      const fallbackPool = type === 'truth' ? activeRoom.truths : activeRoom.dares;
      const availableFallbacks = fallbackPool.filter(q => !askedQuestionsForPlayer.includes(q.text));
      if (availableFallbacks.length > 0) {
        const fallbackQ = availableFallbacks[Math.floor(Math.random() * availableFallbacks.length)];
        questionText = fallbackQ.text;
        questionId = fallbackQ.id;
      } else {
        toast({ title: "Out of Questions!", description: `No more ${type}s (AI & fallback).`, variant: "destructive" });
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
    const roomRef = ref(database, `rooms/${activeRoomId}`);
    const updates: any = {};
    updates.currentQuestion = newQuestion;
    updates.gameState = 'questionRevealed';
    updates.lastActivity = new Date().toISOString();
    
    const playerHistoryPath = `playerQuestionHistory/${currentPlayer.id}/${type}`;
    const newPlayerHistory = [...askedQuestionsForPlayer, newQuestion.text];
    updates[playerHistoryPath] = newPlayerHistory;

    const systemMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `${currentPlayer.nickname} chose ${type}. Question: ${newQuestion.text}`, timestamp: new Date().toISOString(), type: 'system' };
    updates.chatMessages = [...activeRoom.chatMessages, systemMessage];

    try {
      await update(roomRef, updates);
    } catch (error) {
      console.error("Error updating room after selecting T/D:", error);
      toast({title: "Error", description: "Could not update game state.", variant: "destructive"});
    } finally {
      setIsLoadingQuestion(false);
    }
  }, [activeRoom, activeRoomId, toast, setIsLoadingQuestion]);


  const submitAnswer = useCallback(async (answer: string, isDareSuccessful?: boolean) => {
    if (!activeRoom || !activeRoomId || !activeRoom.currentPlayerId || activeRoom.currentQuestion == null || (activeRoom.gameState !== 'questionRevealed' && activeRoom.gameState !== 'awaitingAnswer')) {
        toast({ title: "Error", description: "Cannot submit answer at this time.", variant: "destructive"});
        return;
    }

    const player = activeRoom.players.find(p => p.id === activeRoom.currentPlayerId);
    if (!player) return;

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    const messageType = activeRoom.currentQuestion.type === 'truth' ? 'truthAnswer' : 'dareResult';
    const formattedAnswer = activeRoom.currentQuestion.type === 'dare' ? `${isDareSuccessful ? '✅ Completed:' : '❌ Failed:'} ${answer}` : answer;

    const updates: any = {};
    const newChatMessage: ChatMessage = { id: Date.now().toString(), senderId: player.id, senderNickname: player.nickname, text: formattedAnswer, timestamp: new Date().toISOString(), type: messageType };
    updates.chatMessages = [...activeRoom.chatMessages, newChatMessage];
    updates.currentQuestion = null;
    updates.gameState = 'inProgress'; // Intermediate state before nextTurn makes it 'playerChoosing'
    updates.lastActivity = new Date().toISOString();

    if (activeRoom.currentQuestion.type === 'dare') {
      const playerIndex = activeRoom.players.findIndex(p => p.id === player.id);
      if (playerIndex !== -1) {
        updates[`players/${playerIndex}/score`] = player.score + (isDareSuccessful ? 1 : 0);
      }
    }
    
    try {
      await update(roomRef, updates);
      // Call nextTurn after state update has been processed by RTDB listener or directly
      // The listener for activeRoom will eventually call nextTurn IF gameState is appropriate
      // OR we can call it here, but need to be careful about race conditions
      // For now, let nextTurn be called from a useEffect watching gameState or similar, or ensure RTDB is source of truth
      // Directly calling nextTurn() here.
      await nextTurn();

    } catch (error) {
      console.error("Error submitting answer:", error);
      toast({title: "Submit Error", description: "Could not submit answer.", variant: "destructive"});
    }
  }, [activeRoom, activeRoomId, toast, nextTurn]);

  const addChatMessage = useCallback(async (senderId: string, senderNickname: string, text: string, type: ChatMessageType = 'message') => {
    if (!activeRoom || !activeRoomId) return;

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
        finalSenderId = 'system'; // Use a generic ID for system messages
        finalType = 'system';
        toast({ title: "Content Moderated", description: `Your message was flagged: ${moderationResult.reason}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Moderation error:", error);
      toast({ title: "Moderation Error", description: "Could not process message moderation.", variant: "destructive" });
      // Decide if we still want to send the original message or block it. For now, send original if moderation fails.
    } finally {
      setIsLoadingModeration(false);
    }

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    const newChatMessage: ChatMessage = { id: Date.now().toString(), senderId: finalSenderId, senderNickname: finalSenderNickname, text: processedText, timestamp: new Date().toISOString(), type: finalType };
    const chatMessagesPath = `chatMessages/${activeRoom.chatMessages.length}`; // Appends to array
    
    try {
      await update(roomRef, { [chatMessagesPath]: newChatMessage, lastActivity: new Date().toISOString() });
    } catch (error) {
        console.error("Error adding chat message:", error);
        toast({title: "Chat Error", description: "Could not send message.", variant: "destructive"});
    }
  }, [activeRoom, activeRoomId, toast, setIsLoadingModeration]);

  return (
    <GameContext.Provider value={{
      activeRoom, activeRoomId, setActiveRoomId,
      createRoom, joinRoom, leaveRoom, startGame,
      selectTruthOrDare, submitAnswer, addChatMessage,
      getPlayer, isLoadingModeration, isLoadingQuestion, isLoadingRoom
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
