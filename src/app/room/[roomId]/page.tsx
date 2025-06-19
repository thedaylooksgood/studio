
"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGame } from '@/contexts/GameContext';
import type { Player } from '@/types/game';
import { PlayerList } from '@/components/game/PlayerList';
import { ChatWindow } from '@/components/game/ChatWindow';
import { QuestionDisplay } from '@/components/game/QuestionDisplay';
import { Timer } from '@/components/game/Timer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, LogOut, Play, HelpCircle, Zap, Send, Users, Loader2 } from 'lucide-react'; 
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';


export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const roomId = params.roomId as string;

  const { 
    activeRoom, setActiveRoomId, getPlayer, startGame, selectTruthOrDare, 
    submitAnswer, leaveRoom, isLoadingModeration, isLoadingQuestion, isLoadingRoom
  } = useGame();
  
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [dareAnswerText, setDareAnswerText] = useState("");
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState(false);
  const [answerText, setAnswerText] = useState("");

  useEffect(() => {
    if (roomId) {
      setActiveRoomId(roomId);
    }
    // Cleanup listener when component unmounts or roomId changes
    return () => {
      if (roomId) {
        // setActiveRoomId(null); // Or handle listener detachment more explicitly if needed by context
      }
    };
  }, [roomId, setActiveRoomId]);


  useEffect(() => {
    // This effect attempts to set localPlayerId once the activeRoom data is available
    const storedPlayerId = localStorage.getItem(`riskyRoomsPlayerId_${roomId}`);
    if (storedPlayerId) {
      setLocalPlayerId(storedPlayerId);
    } else if (activeRoom && activeRoom.id === roomId) { // Ensure activeRoom is for the current roomId
      // If no storedPlayerId, and activeRoom is loaded, try to identify the player
      // This is mainly for the host after creating a room or if query param exists for new joiners
      const searchParams = new URLSearchParams(window.location.search);
      const playerIdFromQuery = searchParams.get('playerId');

      if (activeRoom.players.length === 1 && activeRoom.hostId === activeRoom.players[0].id) {
        // Likely the host just created the room
        setLocalPlayerId(activeRoom.hostId);
        localStorage.setItem(`riskyRoomsPlayerId_${roomId}`, activeRoom.hostId);
      } else if (playerIdFromQuery && activeRoom.players.find(p => p.id === playerIdFromQuery)) {
        // Player joined and ID is in query
        setLocalPlayerId(playerIdFromQuery);
        localStorage.setItem(`riskyRoomsPlayerId_${roomId}`, playerIdFromQuery);
         // Clean up URL query param after use
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
      // If still no localPlayerId, they might be a spectator or need to rejoin.
      // The UI will show "Loading Room & Player Info..." or appropriate messages.
    }
  }, [roomId, activeRoom]); // Re-run if activeRoom data changes (e.g., after loading)

  const currentPlayer = localPlayerId ? getPlayer(localPlayerId) : undefined;
  const gamePlayerWhoseTurn = activeRoom?.currentPlayerId ? getPlayer(activeRoom.currentPlayerId) : undefined;

  useEffect(() => {
    // Handle room not found AFTER attempting to load
    if (!isLoadingRoom && !activeRoom && roomId) {
      // Give a small delay for initial load from RTDB via context
      const timer = setTimeout(() => {
        if (!activeRoom && !isLoadingRoom) { // Re-check after delay
             toast({ title: "Room Not Found", description: "This room doesn't exist or has been closed.", variant: "destructive" });
             router.push('/');
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isLoadingRoom, activeRoom, roomId, router, toast]);
  
  const handleLeaveRoom = async () => {
    if (currentPlayer) {
      setIsLeaving(true);
      await leaveRoom(); // leaveRoom in context now knows activeRoomId and localPlayerId (implicitly)
      localStorage.removeItem(`riskyRoomsPlayerId_${roomId}`); 
      toast({ title: "Left Room", description: "You have left the game room." });
      // router.push('/'); // leaveRoom in context will navigate if user is leaving.
      setIsLeaving(false);
    }
  };

  const copyRoomCode = () => {
    if (activeRoom?.id) {
      navigator.clipboard.writeText(activeRoom.id)
        .then(() => toast({ title: "Room Code Copied!", description: `${activeRoom.id} copied to clipboard.` }))
        .catch(() => toast({ title: "Failed to copy", variant: "destructive" }));
    }
  };
  
  const handleOpenAnswerModal = () => {
    setAnswerText(""); 
    setDareAnswerText("");
    setIsAnswerModalOpen(true);
  };

  const handleSubmitTruthAnswer = async () => {
    if (answerText.trim() === "") {
      toast({title: "Empty Answer", description: "Truth cannot be empty.", variant: "destructive"});
      return;
    }
    await submitAnswer(answerText.trim());
    setIsAnswerModalOpen(false);
    setAnswerText("");
  };

  const handleSubmitDareResult = async (isSuccess: boolean) => {
     if (dareAnswerText.trim() === "" && !isSuccess) { 
      toast({title: "Empty Result", description: "Please describe the result of the dare if failed/skipped.", variant: "destructive"});
      return;
    }
    await submitAnswer(dareAnswerText.trim() || (isSuccess ? "Completed!" : "Failed/Skipped."), isSuccess);
    setIsAnswerModalOpen(false);
    setDareAnswerText("");
  };

  if (isLoadingRoom || !activeRoom || (activeRoom.players.length > 0 && !currentPlayer && localPlayerId === null)) {
    // Show loader if room is loading, or if room is loaded but current player isn't identified yet (and it's not a spectator scenario with no localPlayerId)
    // Also handles the case where localPlayerId is still null but we expect it (e.g. host just created)
    let loadingMessage = "Loading Room Info...";
    if(isLoadingRoom) loadingMessage = "Connecting to Room...";
    else if (!activeRoom && !isLoadingRoom) loadingMessage = "Room not found or connection failed.";
    else if (activeRoom && !currentPlayer && activeRoom.players.length > 0) loadingMessage = "Identifying player...";


    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{loadingMessage}</p>
        {!isLoadingRoom && !activeRoom && <Button variant="link" onClick={() => router.push('/')} className="mt-4">Go Home</Button>}
      </div>
    );
  }
  
  const isMyTurn = currentPlayer?.id === activeRoom.currentPlayerId;

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col gap-6 animate-fadeIn">
      <header className="flex flex-col sm:flex-row justify-between items-center gap-2 pb-4 border-b border-primary/20">
        <div>
            <h1 className="text-3xl sm:text-4xl font-headline text-primary flex items-center">
              <Users className="w-8 h-8 mr-2 text-accent"/> Risky Room: <span className="font-mono ml-2 text-accent">{activeRoom.id}</span>
            <Button variant="ghost" size="sm" onClick={copyRoomCode} className="ml-2" aria-label="Copy Room Code">
              <Copy className="w-4 h-4" />
            </Button>
          </h1>
          <Badge variant={activeRoom.mode === 'moderate' ? 'destructive' : 'default'} className="capitalize mt-1 text-sm">{activeRoom.mode} Mode</Badge>
        </div>
        <div className="flex items-center gap-2">
          {currentPlayer && <span className="text-sm text-muted-foreground">You are: {currentPlayer.nickname} {currentPlayer.isHost && "(Host)"}</span>}
          <Button variant="outline" size="sm" onClick={handleLeaveRoom} disabled={isLeaving || !currentPlayer}>
            <LogOut className="w-4 h-4 mr-1" /> {isLeaving ? "Leaving..." : "Leave Room"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
        <aside className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-xl font-headline">Players ({activeRoom.players.length})</CardTitle></CardHeader>
            <CardContent><PlayerList players={activeRoom.players} currentPlayerId={activeRoom.currentPlayerId} /></CardContent>
          </Card>

          {activeRoom.gameState !== 'waiting' && activeRoom.gameState !== 'gameOver' && gamePlayerWhoseTurn && (
            <Card className="bg-card/80">
              <CardHeader>
                <CardTitle className="text-xl font-headline">Current Turn</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                  <p className="text-2xl font-bold text-accent animate-pulse">{gamePlayerWhoseTurn.nickname}</p>
                  <p className="text-muted-foreground">
                    {isMyTurn ? "It's your turn!" : `Waiting for ${gamePlayerWhoseTurn.nickname}...`}
                  </p>
              </CardContent>
            </Card>
          )}

          {activeRoom.gameState === 'waiting' && (
             <Card className="bg-primary/10 border-primary">
                <CardHeader><CardTitle className="text-xl font-headline">Waiting for Players</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-4">The game will begin once the host starts it. Min 1 player needed.</p>
                    {currentPlayer?.isHost && (
                        <Button 
                            onClick={startGame} 
                            disabled={activeRoom.players.length < 1 || isLoadingQuestion} 
                            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 animate-button-press"
                        >
                            <Play className="w-5 h-5 mr-2"/> Start Game ({activeRoom.players.length}/1+ player)
                        </Button>
                    )}
                    {!currentPlayer?.isHost && <p className="text-sm italic text-primary">Waiting for host ({activeRoom.players.find(p=>p.id === activeRoom.hostId)?.nickname || 'Host'}) to start...</p>}
                </CardContent>
             </Card>
          )}
        </aside>

        <main className="lg:col-span-2 space-y-6">
          {(activeRoom.gameState !== 'waiting' && activeRoom.gameState !== 'gameOver') && (
            <>
              <QuestionDisplay question={activeRoom.currentQuestion} onAnimationComplete={() => { if(isMyTurn && activeRoom.gameState === 'questionRevealed' && activeRoom.currentQuestion) setIsAnswerModalOpen(true)}} />
              
              {isMyTurn && activeRoom.gameState === 'playerChoosing' && currentPlayer && (
                <Card className="shadow-lg">
                  <CardHeader><CardTitle className="text-xl font-headline text-center">Your Choice, {currentPlayer.nickname}!</CardTitle></CardHeader>
                  <CardContent className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button 
                        onClick={() => selectTruthOrDare('truth')} 
                        className="bg-blue-600 hover:bg-blue-700 text-white flex-1 py-6 text-lg" 
                        size="lg"
                        disabled={isLoadingQuestion}
                    >
                      {isLoadingQuestion ? <Loader2 className="w-6 h-6 mr-2 animate-spin"/> : <HelpCircle className="w-6 h-6 mr-2"/>} 
                      Truth
                    </Button>
                    <Button 
                        onClick={() => selectTruthOrDare('dare')} 
                        className="bg-red-600 hover:bg-red-700 text-white flex-1 py-6 text-lg" 
                        size="lg"
                        disabled={isLoadingQuestion}
                    >
                      {isLoadingQuestion ? <Loader2 className="w-6 h-6 mr-2 animate-spin"/> : <Zap className="w-6 h-6 mr-2"/>}
                      Dare
                    </Button>
                  </CardContent>
                </Card>
              )}

              {isMyTurn && activeRoom.gameState === 'questionRevealed' && activeRoom.currentQuestion && currentPlayer && (
                <Dialog open={isAnswerModalOpen} onOpenChange={(isOpen) => {
                  setIsAnswerModalOpen(isOpen);
                  if (!isOpen) { 
                    setAnswerText("");
                    setDareAnswerText("");
                  }
                }}>
                    <DialogTrigger asChild>
                        {!isAnswerModalOpen && 
                          <Button className="w-full mt-4 bg-accent text-accent-foreground hover:bg-accent/90 animate-button-press" size="lg" onClick={handleOpenAnswerModal}>
                              <Send className="w-5 h-5 mr-2"/> Respond to {activeRoom.currentQuestion.type}
                          </Button>
                        }
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                        <DialogTitle>Your {activeRoom.currentQuestion.type === 'truth' ? 'Truth' : 'Dare Result'}</DialogTitle>
                        <DialogDescription>
                            {activeRoom.currentQuestion.type === 'truth' ? "Tell us your truth!" : "What happened with the dare?"}
                            <div className="font-semibold mt-2">{activeRoom.currentQuestion.text}</div>
                        </DialogDescription>
                        </DialogHeader>
                        {activeRoom.currentQuestion.type === 'truth' ? (
                        <>
                            <Textarea placeholder="Your truth..." value={answerText} onChange={(e) => setAnswerText(e.target.value)} className="min-h-[100px]" />
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAnswerModalOpen(false)}>Cancel</Button>
                                <Button onClick={handleSubmitTruthAnswer} className="bg-primary">Submit Truth</Button>
                            </DialogFooter>
                        </>
                        ) : ( 
                        <>
                            <Textarea placeholder="Describe what happened (optional for success, required for fail/skip)..." value={dareAnswerText} onChange={(e) => setDareAnswerText(e.target.value)} className="min-h-[100px]" />
                             <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:space-x-2">
                                <Button onClick={() => handleSubmitDareResult(true)} className="bg-green-600 hover:bg-green-700 text-white flex-1">✅ Completed Successfully</Button>
                                <Button onClick={() => handleSubmitDareResult(false)} className="bg-red-600 hover:bg-red-700 text-white flex-1">❌ Failed / Skipped</Button>
                             </DialogFooter>
                             <Button variant="outline" onClick={() => setIsAnswerModalOpen(false)} className="w-full mt-2">Cancel</Button>
                        </>
                        )}
                    </DialogContent>
                </Dialog>
              )}

              {activeRoom.currentQuestion && (
                <Timer 
                    duration={60} 
                    onTimeUp={async () => {
                        if(isMyTurn && (activeRoom.gameState === 'questionRevealed' || activeRoom.gameState === 'playerChoosing')) {
                            toast({title: "Time's Up!", description: "Moving to next player.", variant: "destructive"});
                            if (activeRoom.gameState === 'questionRevealed') {
                               await submitAnswer(activeRoom.currentQuestion?.type === 'truth' ? "Time ran out (skipped)." : "Time ran out (failed).", false);
                            } else if (activeRoom.gameState === 'playerChoosing') {
                                // If stuck choosing, it implies AI is taking too long or failed.
                                // The submitAnswer will handle the "skip" and call nextTurn.
                                // An explicit "skip turn" or force nextTurn might be cleaner for this specific scenario.
                               await submitAnswer("Time ran out choosing question.", false);
                            }
                        }
                    }}
                    isActive={!!(isMyTurn && currentPlayer && (activeRoom.gameState === 'questionRevealed' || activeRoom.gameState === 'playerChoosing'))}
                    resetKey={`${activeRoom.currentPlayerId}-${activeRoom.round}-${activeRoom.currentQuestion?.id || 'choosing'}`}
                />
              )}
            </>
          )}

          {activeRoom.gameState === 'gameOver' && (
            <Card>
              <CardHeader><CardTitle className="text-2xl font-headline text-center">Game Over!</CardTitle></CardHeader>
              <CardContent><p className="text-center">Thanks for playing! Final scores: {activeRoom.players.map(p => `${p.nickname}: ${p.score}`).join(', ')}</p></CardContent>
              <CardFooter><Button onClick={() => { setActiveRoomId(null); router.push('/');}} className="w-full">Back to Home</Button></CardFooter>
            </Card>
          )}
          {activeRoom.id && currentPlayer && ( // Ensure roomId and currentPlayer are available for ChatWindow
             <ChatWindow messages={activeRoom.chatMessages || []} roomId={activeRoom.id} currentPlayer={currentPlayer} />
          )}
        </main>
      </div>

      {(isLoadingModeration || isLoadingQuestion) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl flex items-center space-x-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-lg">
                {isLoadingQuestion && "AI is crafting your question..."}
                {isLoadingModeration && !isLoadingQuestion && "AI Moderating message..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
