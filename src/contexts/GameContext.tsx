
"use client";

import type { Room, Player, ChatMessage, GameMode, Question, GameState, ChatMessageType, PlayerQuestionHistory } from '@/types/game';
import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomCode, getInitialQuestions as getFallbackQuestions, selectNextPlayer } from '@/lib/gameUtils';
import { flagMessage, FlagMessageOutput } from '@/ai/flows/flag-message';
import { generateQuestion, GenerateQuestionInput } from '@/ai/flows/generate-question-flow';
import { useToast } from '@/hooks/use-toast';
import { database } from '@/lib/firebase'; // Firebase app and database instances
import { ref, set, onValue, update, remove, off, get, serverTimestamp } from 'firebase/database';

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
  const roomListenerRef = useRef<any>(null); // Stores the listener function itself


  const setActiveRoomId = useCallback((roomId: string | null) => {
    console.log(`GameContext: setActiveRoomId called with ${roomId}. Current activeRoomId: ${activeRoomId}`);
    setIsLoadingRoom(true);
    setActiveRoom(null); 

    if (roomListenerRef.current && activeRoomId) {
      if (!database) {
        console.error("GameContext: Firebase database is not initialized. Cannot detach old listener.");
      } else {
        try {
            const oldRoomPath = `rooms/${activeRoomId}`;
            console.log(`GameContext: Detaching listener from ${oldRoomPath}`);
            const oldRoomRef = ref(database, oldRoomPath);
            off(oldRoomRef, 'value', roomListenerRef.current);
            console.log(`GameContext: Listener detached from ${oldRoomPath}`);
        } catch (e) {
            console.error("GameContext: Error detaching Firebase listener:", e);
        }
      }
      roomListenerRef.current = null;
    }
    setActiveRoomIdState(roomId);
  }, [activeRoomId]); // Dependency: current activeRoomId to properly detach listener

  useEffect(() => {
    if (!database) {
      console.error("GameContext: Firebase database is not initialized. Cannot set up room listener.");
      toast({ title: "Database Error", description: "Firebase Realtime Database is not available. Please check configuration.", variant: "destructive" });
      setIsLoadingRoom(false);
      setActiveRoom(null); // Ensure UI doesn't stay stuck on loading
      return;
    }

    if (!activeRoomId) {
      console.log("GameContext: No activeRoomId. Clearing active room and stopping loading.");
      setActiveRoom(null);
      setIsLoadingRoom(false);
      return;
    }

    console.log(`GameContext: activeRoomId changed to ${activeRoomId}. Setting up listener.`);
    setIsLoadingRoom(true);
    const roomPath = `rooms/${activeRoomId}`;
    const currentRoomRef = ref(database, roomPath);
    
    roomListenerRef.current = onValue(currentRoomRef, (snapshot) => {
      console.log(`GameContext: Data received for ${roomPath}`);
      const roomData = snapshot.val();
      if (roomData) {
        console.log(`GameContext: Room data found for ${activeRoomId}:`, roomData);
        const processedRoomData = {
          ...roomData,
          chatMessages: (roomData.chatMessages || []).map((msg: ChatMessage) => ({
            ...msg,
            timestamp: new Date(msg.timestamp).toISOString()
          })),
          lastActivity: new Date(roomData.lastActivity).toISOString(),
        };
        setActiveRoom(processedRoomData as Room);
      } else {
        console.warn(`GameContext: No room data found for ${activeRoomId} at path ${roomPath}. Setting activeRoom to null.`);
        setActiveRoom(null);
      }
      setIsLoadingRoom(false);
      console.log("GameContext: isLoadingRoom set to false after data processing.");
    }, (error) => {
      console.error(`GameContext: Firebase read failed for ${roomPath}:`, error);
      toast({ title: "Connection Error", description: "Failed to connect to the game room data.", variant: "destructive" });
      setIsLoadingRoom(false);
      setActiveRoom(null);
      console.log("GameContext: isLoadingRoom set to false after read error.");
    });

    return () => {
      if (roomListenerRef.current) {
        console.log(`GameContext: Cleaning up listener for ${roomPath}`);
        off(currentRoomRef, 'value', roomListenerRef.current);
        roomListenerRef.current = null;
        console.log(`GameContext: Listener for ${roomPath} cleaned up.`);
      }
    };
  }, [activeRoomId, toast, router]);


  const getPlayer = useCallback((playerId: string): Player | undefined => {
    return activeRoom?.players.find(p => p.id === playerId);
  }, [activeRoom]);

  const createRoom = useCallback(async (hostNickname: string, mode: GameMode): Promise<string | null> => {
    if (!database) {
      toast({ title: "Database Error", description: "Cannot create room: Firebase not initialized.", variant: "destructive" });
      return null;
    }
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

    try {
      const roomRef = ref(database, `rooms/${newRoomId}`);
      await set(roomRef, { ...newRoomData, lastActivity: serverTimestamp() }); // Use serverTimestamp for RTDB
      return newRoomId;
    } catch (error) {
      console.error("Error creating room in RTDB:", error);
      toast({ title: "Error Creating Room", description: "Could not save room to database.", variant: "destructive" });
      return null;
    }
  }, [toast]);

  const joinRoom = useCallback(async (roomIdToJoin: string, playerNickname: string): Promise<Player | null> => {
    if (!database) {
      toast({ title: "Database Error", description: "Cannot join room: Firebase not initialized.", variant: "destructive" });
      return null;
    }
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
      const newPlayersArray = [...currentRoomData.players, newPlayer];
      updates['players'] = newPlayersArray;
      
      const newChatMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `${playerNickname} joined the room!`, timestamp: new Date().toISOString(), type: 'playerJoin'};
      const newChatMessagesArray = [...(currentRoomData.chatMessages || []), newChatMessage];
      updates['chatMessages'] = newChatMessagesArray;
      
      updates[`playerQuestionHistory/${newPlayerId}`] = { truths: [], dares: [] };
      updates['lastActivity'] = serverTimestamp();

      await update(roomRef, updates);
      return newPlayer;

    } catch (error) {
      console.error("Error joining room:", error);
      toast({ title: "Join Error", description: "Could not join the room.", variant: "destructive" });
      return null;
    }
  }, [toast]);

  const leaveRoom = useCallback(async () => {
    if (!database || !activeRoom || !activeRoomId) {
      toast({ title: "Error", description: "Cannot leave room: No active room or database connection.", variant: "destructive" });
      return;
    }

    const localPlayerId = localStorage.getItem(`riskyRoomsPlayerId_${activeRoomId}`);
    if (!localPlayerId) return;

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    
    try {
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) return; 

      let currentRoomData = snapshot.val() as Room;
      const playerLeaving = currentRoomData.players.find(p => p.id === localPlayerId);
      if (!playerLeaving) return;

      const remainingPlayers = currentRoomData.players.filter(p => p.id !== localPlayerId);

      if (remainingPlayers.length === 0) {
        await remove(roomRef);
        toast({ title: "Room Closed", description: "The last player left, room closed." });
        setActiveRoomIdState(null); 
        router.push('/');
        return;
      }
      
      const updates: any = {};
      updates.players = remainingPlayers;
      
      let newHostId = currentRoomData.hostId;
      if (currentRoomData.hostId === localPlayerId) {
        newHostId = remainingPlayers[0].id;
        updates.hostId = newHostId;
        updates.players = remainingPlayers.map(p => p.id === newHostId ? { ...p, isHost: true } : p);
      }
      
      let newCurrentPlayerId = currentRoomData.currentPlayerId;
      let newGameState = currentRoomData.gameState;
      let newCurrentQuestion = currentRoomData.currentQuestion;
      let turnChangeMessage: ChatMessage | null = null;

      if (currentRoomData.currentPlayerId === localPlayerId && currentRoomData.gameState !== 'waiting' && currentRoomData.gameState !== 'gameOver') {
        const nextPlayerAfterLeave = selectNextPlayer(remainingPlayers, null); 
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
      let newChatMessages = [...(currentRoomData.chatMessages || []), leaveMessage];
      if (turnChangeMessage) {
        newChatMessages.push(turnChangeMessage);
      }
      updates.chatMessages = newChatMessages;
      
      const newPlayerQuestionHistory = { ...currentRoomData.playerQuestionHistory };
      delete newPlayerQuestionHistory[localPlayerId];
      updates.playerQuestionHistory = newPlayerQuestionHistory;
      updates.lastActivity = serverTimestamp();

      await update(roomRef, updates);
      
      // If the current user is the one leaving:
      const storedPlayerIdForThisRoom = localStorage.getItem(`riskyRoomsPlayerId_${activeRoomId}`);
      if (localPlayerId === storedPlayerIdForThisRoom) { 
         setActiveRoomIdState(null); 
         router.push('/');
      }

    } catch (error) {
      console.error("Error leaving room:", error);
      toast({ title: "Leave Error", description: "Could not leave the room.", variant: "destructive" });
    }
  }, [activeRoom, activeRoomId, toast, router, getPlayer]);

  const startGame = useCallback(async () => {
    if (!database || !activeRoom || !activeRoomId || activeRoom.gameState !== 'waiting') return;
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
      updates.lastActivity = serverTimestamp();
      
      const startMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `Game started! It's ${firstPlayer.nickname}'s turn.`, timestamp: new Date().toISOString(), type: 'system' };
      const turnMessage: ChatMessage = { id: (Date.now() + 1).toString(), senderNickname: 'System', text: `${firstPlayer.nickname}, choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' };
      updates.chatMessages = [...(activeRoom.chatMessages || []), startMessage, turnMessage];

      await update(roomRef, updates);

    } catch (error) {
      console.error("Error starting game:", error);
      toast({ title: "Start Game Error", description: "Could not start the game.", variant: "destructive" });
    }
  }, [activeRoom, activeRoomId, toast]);

  const nextTurn = useCallback(async () => {
    if (!database || !activeRoom || !activeRoomId || activeRoom.players.length === 0) return;

    const roomRef = ref(database, `rooms/${activeRoomId}`);
    try {
      const nextPlayer = selectNextPlayer(activeRoom.players, activeRoom.currentPlayerId);
      if (!nextPlayer) {
        await update(roomRef, { 
            gameState: 'gameOver', 
            chatMessages: [...(activeRoom.chatMessages || []), {id: Date.now().toString(), senderNickname: "System", text: "Game Over! Could not determine next player.", timestamp: new Date().toISOString(), type: 'system'}],
            lastActivity: serverTimestamp()
        });
        return;
      }

      let newRound = activeRoom.round;
      const currentPlayerIndex = activeRoom.players.findIndex(p => p.id === activeRoom.currentPlayerId);
      const nextPlayerIndex = activeRoom.players.findIndex(p => p.id === nextPlayer.id);

      if (nextPlayerIndex < currentPlayerIndex && activeRoom.round > 0) { // Full cycle completed
        newRound = activeRoom.round + 1;
      }
      
      const updates: any = {
        currentPlayerId: nextPlayer.id,
        gameState: 'playerChoosing',
        currentQuestion: null,
        round: newRound,
        chatMessages: [...(activeRoom.chatMessages || []), { id: Date.now().toString(), senderNickname: 'System', text: `It's ${nextPlayer.nickname}'s turn. Choose Truth or Dare.`, timestamp: new Date().toISOString(), type: 'turnChange' }],
        lastActivity: serverTimestamp()
      };
      await update(roomRef, updates);

    } catch (error) {
      console.error("Error advancing turn:", error);
      toast({ title: "Next Turn Error", description: "Could not advance to the next turn.", variant: "destructive" });
    }
  }, [activeRoom, activeRoomId, toast]);


  const selectTruthOrDare = useCallback(async (type: 'truth' | 'dare') => {
    if (!database || !activeRoom || !activeRoomId || !activeRoom.currentPlayerId || activeRoom.gameState !== 'playerChoosing') {
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
    const askedQuestionsForPlayer = activeRoom.playerQuestionHistory[currentPlayer.id]?.[type === 'truth' ? 'truths' : 'dares'] || [];

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
      toast({ title: "AI Error", description: "AI failed to generate question. Using fallback.", variant: "destructive" });
      const fallbackPool = type === 'truth' ? activeRoom.truths : activeRoom.dares;
      const availableFallbacks = fallbackPool.filter(q => !askedQuestionsForPlayer.includes(q.text));
      if (availableFallbacks.length > 0) {
        const fallbackQ = availableFallbacks[Math.floor(Math.random() * availableFallbacks.length)];
        questionText = fallbackQ.text;
        questionId = fallbackQ.id; // Use fallback ID
      } else {
        questionText = type === 'truth' ? "No more truths for you! You're an open book... or the AI is stumped." : "No more dares for you! You're too wild... or the AI is stumped.";
        questionId = `fallback-exhausted-${Date.now()}`;
        toast({ title: "Out of Questions!", description: `No more unique ${type}s available from AI or fallback list.`, variant: "destructive" });
      }
    }

    if (!questionText) { // Should have text from AI, fallback, or exhausted message
      toast({ title: "Error", description: "Failed to get a question text.", variant: "destructive" });
      setIsLoadingQuestion(false);
      return;
    }

    const newQuestion: Question = { id: questionId, text: questionText, type };
    const roomRef = ref(database, `rooms/${activeRoomId}`);
    const updates: any = {};
    updates.currentQuestion = newQuestion;
    updates.gameState = 'questionRevealed';
    updates.lastActivity = serverTimestamp();
    
    const playerHistoryTypeKey = type === 'truth' ? 'truths' : 'dares';
    const playerHistoryPath = `playerQuestionHistory/${currentPlayer.id}/${playerHistoryTypeKey}`;
    const newPlayerHistory = [...askedQuestionsForPlayer, newQuestion.text];
    updates[playerHistoryPath] = newPlayerHistory;

    const systemMessage: ChatMessage = { id: Date.now().toString(), senderNickname: 'System', text: `${currentPlayer.nickname} chose ${type}. Question: ${newQuestion.text}`, timestamp: new Date().toISOString(), type: 'system' };
    updates.chatMessages = [...(activeRoom.chatMessages || []), systemMessage];

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
    if (!database || !activeRoom || !activeRoomId || !activeRoom.currentPlayerId || activeRoom.currentQuestion == null || (activeRoom.gameState !== 'questionRevealed' && activeRoom.gameState !== 'awaitingAnswer')) {
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
    updates.chatMessages = [...(activeRoom.chatMessages || []), newChatMessage];
    updates.currentQuestion = null;
    // gameState will be 'playerChoosing' after nextTurn is called. No need to set to 'inProgress' here.
    // updates.gameState = 'inProgress'; 
    updates.lastActivity = serverTimestamp();

    if (activeRoom.currentQuestion.type === 'dare' && isDareSuccessful) {
      const playerIndex = activeRoom.players.findIndex(p => p.id === player.id);
      if (playerIndex !== -1) {
        updates[`players/${playerIndex}/score`] = player.score + 1;
      }
    }
    
    try {
      await update(roomRef, updates);
      // Call nextTurn AFTER the state has been successfully updated in Firebase.
      // The RTDB listener will update local activeRoom, then nextTurn can proceed with fresh data.
      // To ensure atomicity or prevent race conditions, nextTurn could be triggered by the listener,
      // or we rely on the fact that RTDB updates are usually fast.
      // For simplicity here, calling nextTurn directly.
      await nextTurn();

    } catch (error) {
      console.error("Error submitting answer:", error);
      toast({title: "Submit Error", description: "Could not submit answer.", variant: "destructive"});
    }
  }, [activeRoom, activeRoomId, toast, nextTurn]);

  const addChatMessage = useCallback(async (chatRoomId: string, senderId: string, senderNickname: string, text: string, type: ChatMessageType = 'message') => {
    if (!database) {
        toast({title: "Chat Error", description: "Database not connected.", variant: "destructive"});
        return;
    }
    if (!activeRoom || chatRoomId !== activeRoom.id) { // Ensure message is for the active room
        toast({title: "Chat Error", description: "Not in a valid room to chat.", variant: "destructive"});
        return;
    }

    setIsLoadingModeration(true);
    let processedText = text;
    let finalSenderNickname = senderNickname;
    let finalSenderId = senderId; // Keep original senderId for non-system messages
    let finalType = type;

    try {
      const moderationResult: FlagMessageOutput = await flagMessage({ messageText: text });
      if (moderationResult.flagged) {
        processedText = `Message from ${senderNickname} was flagged: ${moderationResult.reason}`;
        finalSenderNickname = 'System'; // System announces moderation
        // finalSenderId should still reflect who TRIED to send, or use 'system' id. Let's use 'system' for moderated.
        finalSenderId = 'system'; 
        finalType = 'system';
        toast({ title: "Content Moderated", description: `Your message was flagged: ${moderationResult.reason}`, variant: "destructive" });
      }
    } catch (error) {
      console.error("Moderation error:", error);
      toast({ title: "Moderation Error", description: "Could not process message moderation. Message sent as is.", variant: "destructive" });
      // Fallback: send original message if moderation fails
    } finally {
      setIsLoadingModeration(false);
    }

    const roomRef = ref(database, `rooms/${chatRoomId}`); // Use passed chatRoomId
    const newChatMessage: ChatMessage = { id: Date.now().toString(), senderId: finalSenderId, senderNickname: finalSenderNickname, text: processedText, timestamp: new Date().toISOString(), type: finalType };
    
    // Fetch current messages to append atomically (or use a transaction if high contention expected)
    const currentMessages = activeRoom.chatMessages || [];
    const updatedChatMessages = [...currentMessages, newChatMessage];
    
    try {
      await update(roomRef, { chatMessages: updatedChatMessages, lastActivity: serverTimestamp() });
    } catch (error) {
        console.error("Error adding chat message:", error);
        toast({title: "Chat Error", description: "Could not send message.", variant: "destructive"});
    }
  }, [activeRoom, toast, setIsLoadingModeration]); // activeRoom needed to get current messages

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

