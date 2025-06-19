
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    getCurrentRoom, getPlayer, startGame, selectTruthOrDare, 
    submitAnswer, leaveRoom, isLoadingModeration 
  } = useGame();
  
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [dareAnswerText, setDareAnswerText] = useState("");

  useEffect(() => {
    const storedPlayerId = localStorage.getItem(`riskyRoomsPlayerId_${roomId}`);
    if (storedPlayerId) {
      setLocalPlayerId(storedPlayerId);
    } else {
      // Attempt to derive player ID if not in localStorage (e.g., host just created room)
      const room = getCurrentRoom(roomId);
      if (room && room.players.length === 1 && room.hostId === room.players[0].id) {
        // If only one player and they are the host, assume this is the host.
        setLocalPlayerId(room.hostId);
        localStorage.setItem(`riskyRoomsPlayerId_${roomId}`, room.hostId);
      } else if (room && room.players.length > 0) {
        // Check query params for playerId, common after joining
        const searchParams = new URLSearchParams(window.location.search);
        const playerIdFromQuery = searchParams.get('playerId');
        if (playerIdFromQuery && room.players.find(p => p.id === playerIdFromQuery)) {
          setLocalPlayerId(playerIdFromQuery);
          localStorage.setItem(`riskyRoomsPlayerId_${roomId}`, playerIdFromQuery);
        } else {
           // If no clear way to identify the player, redirect.
           // This can happen if a user bookmarks the room page or state is lost.
           toast({ title: "Session Expired", description: "Your player session was not found. Please rejoin the room.", variant: "destructive"});
           router.push('/join');
        }
      }
      // If room doesn't exist yet (still loading), this effect will re-run
    }
  }, [roomId, getCurrentRoom, router, toast]);


  const room = getCurrentRoom(roomId);
  const currentPlayer = localPlayerId ? getPlayer(roomId, localPlayerId) : undefined;
  const gamePlayerWhoseTurn = room?.currentPlayerId ? getPlayer(roomId, room.currentPlayerId) : undefined;

  useEffect(() => {
    // If room data is not available after a short delay (and not just loading moderation state),
    // assume room doesn't exist or was closed, then redirect.
    if (!room && !isLoadingModeration && localPlayerId !== null) { // Check localPlayerId to ensure initial setup attempts have run
      const timer = setTimeout(() => {
        if(!getCurrentRoom(roomId)) { // Double check after delay
            toast({ title: "Room Not Found", description: "This room doesn't exist or has been closed.", variant: "destructive" });
            router.push('/');
        }
      }, 2000); // Increased delay to allow for state hydration
      return () => clearTimeout(timer);
    }
  }, [room, roomId, router, toast, isLoadingModeration, getCurrentRoom, localPlayerId]);
  
  const handleLeaveRoom = () => {
    if (currentPlayer) {
      setIsLeaving(true);
      leaveRoom(roomId, currentPlayer.id);
      localStorage.removeItem(`riskyRoomsPlayerId_${roomId}`); // Clear specific room player ID
      toast({ title: "Left Room", description: "You have left the game room." });
      router.push('/');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId)
      .then(() => toast({ title: "Room Code Copied!", description: `${roomId} copied to clipboard.` }))
      .catch(() => toast({ title: "Failed to copy", variant: "destructive" }));
  };
  
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState(false);
  const [answerText, setAnswerText] = useState("");

  const handleOpenAnswerModal = () => {
    setAnswerText(""); 
    setIsAnswerModalOpen(true);
  };

  const handleSubmitTruthAnswer = () => {
    if (answerText.trim() === "") {
      toast({title: "Empty Answer", description: "Truth cannot be empty.", variant: "destructive"});
      return;
    }
    submitAnswer(roomId, answerText.trim());
    setIsAnswerModalOpen(false);
    setAnswerText("");
  };

  const handleSubmitDareResult = (isSuccess: boolean) => {
     if (dareAnswerText.trim() === "" && !isSuccess) { 
      toast({title: "Empty Result", description: "Please describe the result of the dare if failed/skipped.", variant: "destructive"});
      return;
    }
    submitAnswer(roomId, dareAnswerText.trim() || (isSuccess ? "Completed!" : "Failed/Skipped."), isSuccess);
    setIsAnswerModalOpen(false);
    setDareAnswerText("");
  };


  if (!room || !currentPlayer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading Room & Player Info...</p>
        <Button variant="link" onClick={() => router.push('/')} className="mt-4">Go Home</Button>
      </div>
    );
  }
  
  const isMyTurn = currentPlayer.id === room.currentPlayerId;

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col gap-6 animate-fadeIn">
      <header className="flex flex-col sm:flex-row justify-between items-center gap-2 pb-4 border-b border-primary/20">
        <div>
            <h1 className="text-3xl sm:text-4xl font-headline text-primary flex items-center">
              <Users className="w-8 h-8 mr-2 text-accent"/> Risky Room: <span className="font-mono ml-2 text-accent">{room.id}</span>
            <Button variant="ghost" size="sm" onClick={copyRoomCode} className="ml-2" aria-label="Copy Room Code">
              <Copy className="w-4 h-4" />
            </Button>
          </h1>
          <Badge variant={room.mode === 'moderate' ? 'destructive' : 'default'} className="capitalize mt-1 text-sm">{room.mode} Mode</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">You are: {currentPlayer.nickname} {currentPlayer.isHost && "(Host)"}</span>
          <Button variant="outline" size="sm" onClick={handleLeaveRoom} disabled={isLeaving}>
            <LogOut className="w-4 h-4 mr-1" /> {isLeaving ? "Leaving..." : "Leave Room"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
        {/* Left Column: Players & Game Info */}
        <aside className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-xl font-headline">Players ({room.players.length})</CardTitle></CardHeader>
            <CardContent><PlayerList players={room.players} currentPlayerId={room.currentPlayerId} /></CardContent>
          </Card>

          {room.gameState !== 'waiting' && room.gameState !== 'gameOver' && gamePlayerWhoseTurn && (
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

          {room.gameState === 'waiting' && (
             <Card className="bg-primary/10 border-primary">
                <CardHeader><CardTitle className="text-xl font-headline">Waiting for Players</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-muted-foreground mb-4">The game will begin once the host starts it. Min 1 player needed.</p>
                    {currentPlayer.isHost && (
                        <Button 
                            onClick={() => startGame(roomId)} 
                            disabled={room.players.length < 1} // Host can start with 1 player (themselves)
                            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 animate-button-press"
                        >
                            <Play className="w-5 h-5 mr-2"/> Start Game ({room.players.length}/1+ player)
                        </Button>
                    )}
                    {!currentPlayer.isHost && <p className="text-sm italic text-primary">Waiting for host ({room.players.find(p=>p.id === room.hostId)?.nickname || 'Host'}) to start...</p>}
                </CardContent>
             </Card>
          )}
        </aside>

        {/* Middle Column: Game Area */}
        <main className="lg:col-span-2 space-y-6">
          {(room.gameState !== 'waiting' && room.gameState !== 'gameOver') && (
            <>
              <QuestionDisplay question={room.currentQuestion} onAnimationComplete={() => { if(isMyTurn && room.gameState === 'questionRevealed' && room.currentQuestion) setIsAnswerModalOpen(true)}} />
              
              {isMyTurn && room.gameState === 'playerChoosing' && (
                <Card className="shadow-lg">
                  <CardHeader><CardTitle className="text-xl font-headline text-center">Your Choice, {currentPlayer.nickname}!</CardTitle></CardHeader>
                  <CardContent className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button onClick={() => selectTruthOrDare(roomId, 'truth')} className="bg-blue-600 hover:bg-blue-700 text-white flex-1 py-6 text-lg" size="lg">
                      <HelpCircle className="w-6 h-6 mr-2"/> Truth
                    </Button>
                    <Button onClick={() => selectTruthOrDare(roomId, 'dare')} className="bg-red-600 hover:bg-red-700 text-white flex-1 py-6 text-lg" size="lg">
                      <Zap className="w-6 h-6 mr-2"/> Dare
                    </Button>
                  </CardContent>
                </Card>
              )}

              {isMyTurn && room.gameState === 'questionRevealed' && room.currentQuestion && (
                <Dialog open={isAnswerModalOpen} onOpenChange={(isOpen) => {
                  setIsAnswerModalOpen(isOpen);
                  if (!isOpen) { // If modal is closed without submitting
                    setAnswerText("");
                    setDareAnswerText("");
                  }
                }}>
                    <DialogTrigger asChild>
                        {/* Button to open modal is implicitly handled by onAnimationComplete or if user re-opens */}
                        {/* This button could be shown if modal auto-open fails or is disabled */}
                        {!isAnswerModalOpen && 
                          <Button className="w-full mt-4 bg-accent text-accent-foreground hover:bg-accent/90 animate-button-press" size="lg" onClick={handleOpenAnswerModal}>
                              <Send className="w-5 h-5 mr-2"/> Respond to {room.currentQuestion.type}
                          </Button>
                        }
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                        <DialogTitle>Your {room.currentQuestion.type === 'truth' ? 'Truth' : 'Dare Result'}</DialogTitle>
                        <DialogDescription>
                            {room.currentQuestion.type === 'truth' ? "Tell us your truth!" : "What happened with the dare?"}
                            <div className="font-semibold mt-2">{room.currentQuestion.text}</div>
                        </DialogDescription>
                        </DialogHeader>
                        {room.currentQuestion.type === 'truth' ? (
                        <>
                            <Textarea placeholder="Your truth..." value={answerText} onChange={(e) => setAnswerText(e.target.value)} className="min-h-[100px]" />
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAnswerModalOpen(false)}>Cancel</Button>
                                <Button onClick={handleSubmitTruthAnswer} className="bg-primary">Submit Truth</Button>
                            </DialogFooter>
                        </>
                        ) : ( /* Dare */
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

              {room.currentQuestion && (
                <Timer 
                    duration={60} 
                    onTimeUp={() => {
                        if(isMyTurn && (room.gameState === 'questionRevealed' || room.gameState === 'playerChoosing')) { // Also handle if playerChoosing times out
                            toast({title: "Time's Up!", description: "Moving to next player.", variant: "destructive"});
                            // Auto-submit based on current state
                            if (room.gameState === 'questionRevealed') {
                               submitAnswer(roomId, room.currentQuestion?.type === 'truth' ? "Time ran out (skipped)." : "Time ran out (failed).", false);
                            } else if (room.gameState === 'playerChoosing') {
                                // If player fails to choose, effectively skip their turn by moving to next player
                                // The game context's nextTurn will handle this transition.
                                // No direct answer submission here, just advance turn.
                                // This part is tricky, GameContext.nextTurn should be robust.
                                // For simplicity, we can consider this a "fail" of sorts for the turn.
                                // Calling submitAnswer with a generic "skipped turn" might be too complex here.
                                // Ideally, nextTurn itself should be callable to skip.
                                // For now, rely on submitAnswer from questionRevealed for auto-skip.
                                // If stuck in playerChoosing, this timer might need to directly call nextTurn via context if available
                                // Or we ensure playerChoosing leads to questionRevealed quickly or has its own timeout path.
                                // This onTimeUp primarily targets the answer phase.
                                 if (room.currentQuestion) { // If somehow a question exists from a previous state
                                     submitAnswer(roomId, room.currentQuestion?.type === 'truth' ? "Time ran out (skipped)." : "Time ran out (failed).", false);
                                 } else {
                                     // If no question, and player timed out choosing, this is an edge case.
                                     // Potentially call a generic 'skip turn' if that was a function.
                                     // For now, this will effectively do nothing if no question, until next turn is forced by other means.
                                     // A better approach for playerChoosing timeout might be needed in GameContext.
                                     console.warn("Time up in playerChoosing without a question, manual advance might be needed or improve GameContext.nextTurn for skips.")
                                 }
                            }
                        }
                    }}
                    isActive={isMyTurn && (room.gameState === 'questionRevealed' || room.gameState === 'playerChoosing')}
                    resetKey={`${room.currentPlayerId}-${room.round}-${room.currentQuestion?.id || 'choosing'}`}
                />
              )}
            </>
          )}

          {room.gameState === 'gameOver' && (
            <Card>
              <CardHeader><CardTitle className="text-2xl font-headline text-center">Game Over!</CardTitle></CardHeader>
              <CardContent><p className="text-center">Thanks for playing! Final scores: {room.players.map(p => `${p.nickname}: ${p.score}`).join(', ')}</p></CardContent>
              <CardFooter><Button onClick={() => router.push('/')} className="w-full">Back to Home</Button></CardFooter>
            </Card>
          )}

          <ChatWindow messages={room.chatMessages} roomId={roomId} currentPlayer={currentPlayer} />
        </main>
      </div>

      {isLoadingModeration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl flex items-center space-x-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-lg">Processing AI Moderation...</p>
          </div>
        </div>
      )}
    </div>
  );
}
