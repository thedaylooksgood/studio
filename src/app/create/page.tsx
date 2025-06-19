
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ModeSelector } from '@/components/game/ModeSelector';
import type { GameMode } from '@/types/game';
import { useGame } from '@/contexts/GameContext';
import { ArrowLeft, PartyPopper, Loader2 } from 'lucide-react';

export default function CreateRoomPage() {
  const [nickname, setNickname] = useState('');
  const [selectedMode, setSelectedMode] = useState<GameMode>('minimal');
  const [nicknameError, setNicknameError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const { createRoom, setActiveRoomId } = useGame();

  const handleCreateRoom = async () => {
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 3 || trimmedNickname.length > 15) {
      setNicknameError('Nickname must be between 3 and 15 characters.');
      return;
    }
    setNicknameError('');
    setIsCreating(true);

    const newRoomId = await createRoom(trimmedNickname, selectedMode);
    setIsCreating(false);

    if (newRoomId) {
      // Store host's player ID for this room. Assuming createRoom returns the room or host player.
      // For RTDB, the host ID is set during room creation. We need to fetch it or have createRoom provide it.
      // For now, let's assume the first player created in RTDB is the host.
      // This part needs care: after room creation, we need the host's player ID.
      // The GameContext's createRoom now returns newRoomId.
      // The player ID can be constructed (e.g., Date.now()) or fetched.
      // For simplicity, we'll navigate. The RoomPage will handle getting player ID from context.
      // A better way: createRoom could return the hostPlayer object.
      // For now, we assume the local player becomes the host.
      // The RoomPage useEffect for localPlayerId needs to robustly get the host ID after room loads.
      
      // When room is created, GameContext.createRoom resolves, and then we navigate.
      // The RoomPage useEffect will call setActiveRoomId(newRoomId), which triggers RTDB listener.
      // When activeRoom is populated in context, RoomPage can then find the host ID if needed.
      // For now, we set the active room ID to start listening immediately if desired, though navigation will do it.
      setActiveRoomId(newRoomId); // Start listening if not already
      
      // The initial host player ID needs to be stored in localStorage for the RoomPage to pick up.
      // This is tricky as createRoom in context doesn't directly return host's dynamic ID from RTDB easily.
      // A common pattern: createRoom makes the host player, then that player ID is available when room loads.
      // For now, we'll push to room, and RoomPage's useEffect will try to assign localPlayerId if it's the host.
      router.push(`/room/${newRoomId}`);
    }
    // Error handling (toast) is done within createRoom context function.
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-primary/10 p-4 animate-fadeIn">
      <Button variant="ghost" onClick={() => router.push('/')} className="absolute top-4 left-4 text-sm">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
      </Button>
      <Card className="w-full max-w-md shadow-2xl bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">Create New Risky Room</CardTitle>
          <CardDescription>Set up your game and invite your friends!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="nickname" className="text-sm font-medium">Your Nickname</Label>
            <Input
              id="nickname"
              type="text"
              placeholder="Enter your nickname (3-15 chars)"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                if (nicknameError) setNicknameError('');
              }}
              className="mt-1"
              aria-describedby="nickname-description nickname-error"
              maxLength={15}
              aria-invalid={!!nicknameError}
            />
            {nicknameError && <p id="nickname-error" className="text-sm text-destructive mt-1">{nicknameError}</p>}
            <p id="nickname-description" className="text-xs text-muted-foreground mt-1">This will be your display name in the game.</p>
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Select Game Mode</Label>
            <ModeSelector selectedMode={selectedMode} onModeChange={setSelectedMode} />
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleCreateRoom} 
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground animate-button-press"
            disabled={isCreating || nickname.trim().length < 3 || nickname.trim().length > 15}
            aria-label="Create Room and Start Game"
            >
            {isCreating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PartyPopper className="mr-2 h-5 w-5" />}
            {isCreating ? 'Creating Room...' : 'Create Room'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
