
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useGame } from '@/contexts/GameContext';
import { ArrowLeft, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function JoinRoomPage() {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const router = useRouter();
  const { joinRoom, rooms } = useGame(); // `rooms` to check if room exists
  const { toast } = useToast();

  const handleJoinRoom = () => {
    const trimmedNickname = nickname.trim();
    const trimmedRoomCode = roomCode.trim().toUpperCase();

    if (trimmedNickname.length < 3 || trimmedNickname.length > 15) {
      toast({ title: "Validation Error", description: "Nickname must be between 3 and 15 characters.", variant: "destructive" });
      return;
    }
    if (trimmedRoomCode.length !== 6 || !/^[A-Z0-9]{6}$/.test(trimmedRoomCode)) {
      toast({ title: "Validation Error", description: "Room code must be 6 alphanumeric characters.", variant: "destructive" });
      return;
    }

    const roomExists = rooms.find(r => r.id === trimmedRoomCode);
    if (!roomExists) {
      toast({ title: "Error", description: "Room not found. Check the code and try again.", variant: "destructive" });
      return;
    }
    if (roomExists.gameState !== 'waiting') {
        toast({ title: "Error", description: "This game has already started. You cannot join at this time.", variant: "destructive"});
        return;
    }
    if (roomExists.players.find(p => p.nickname.toLowerCase() === trimmedNickname.toLowerCase())) {
        toast({ title: "Error", description: "This nickname is already taken in the room.", variant: "destructive"});
        return;
    }


    const player = joinRoom(trimmedRoomCode, trimmedNickname);
    if (player) {
      router.push(`/room/${trimmedRoomCode}`);
    }
    // joinRoom already handles toasts for errors like room not found or nickname taken
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-primary/10 p-4 animate-fadeIn">
      <Button variant="ghost" onClick={() => router.push('/')} className="absolute top-4 left-4 text-sm">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
      </Button>
      <Card className="w-full max-w-md shadow-2xl bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">Join Risky Room</CardTitle>
          <CardDescription>Enter the room code and your nickname to join the fun!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="roomCode" className="text-sm font-medium">Room Code</Label>
            <Input
              id="roomCode"
              type="text"
              placeholder="Enter 6-digit code (e.g., X7D9F2)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="mt-1"
              maxLength={6}
              aria-describedby="roomcode-description"
            />
            <p id="roomcode-description" className="text-xs text-muted-foreground mt-1">Case-insensitive, will be converted to uppercase.</p>
          </div>
          <div>
            <Label htmlFor="nickname" className="text-sm font-medium">Your Nickname</Label>
            <Input
              id="nickname"
              type="text"
              placeholder="Enter your nickname (3-15 chars)"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="mt-1"
              maxLength={15}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleJoinRoom} 
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground animate-button-press"
            disabled={nickname.trim().length < 3 || nickname.trim().length > 15 || roomCode.trim().length !== 6 || !/^[A-Z0-9]{6}$/.test(roomCode.trim())}
            aria-label="Join Room"
            >
            <LogIn className="mr-2 h-5 w-5" /> Join Room
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
