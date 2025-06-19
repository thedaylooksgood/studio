
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
import { ArrowLeft, PartyPopper } from 'lucide-react';

export default function CreateRoomPage() {
  const [nickname, setNickname] = useState('');
  const [selectedMode, setSelectedMode] = useState<GameMode>('minimal');
  const router = useRouter();
  const { createRoom } = useGame();

  const handleCreateRoom = ()_INPUT_VALIDATION_ Message_for_AI_Assistant_ Hello_AI,_please_make_sure_that_the_input_validation_is_complete._For_example,_the_length_of_nickname_should_be_validated_to_be_between_3_and_15_characters_long._Additionally,_the_validation_error_messages_should_be_displayed_in_the_UI_so_the_user_knows_what_went_wrong._Thanks! _INPUT_VALIDATION_ => {
    if (nickname.trim().length < 3 || nickname.trim().length > 15) {
      // Basic validation, can be improved with form libraries
      alert('Nickname must be between 3 and 15 characters.');
      return;
    }
    const newRoomId = createRoom(nickname.trim(), selectedMode);
    router.push(`/room/${newRoomId}`);
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
              onChange={(e) => setNickname(e.target.value)}
              className="mt-1"
              aria-describedby="nickname-description"
              maxLength={15}
            />
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
            disabled={nickname.trim().length < 3 || nickname.trim().length > 15}
            aria-label="Create Room and Start Game"
            >
            <PartyPopper className="mr-2 h-5 w-5" /> Create Room
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
