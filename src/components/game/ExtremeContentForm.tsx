
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useGame } from '@/contexts/GameContext';
import type { Player } from '@/types/game';
import { Lightbulb, Zap, Send, Loader2 } from 'lucide-react'; // Added Loader2
import { useToast } from '@/hooks/use-toast';
import { filterContent } from '@/lib/gameUtils'; // Import profanity filter

interface ExtremeContentFormProps {
  roomId: string;
  player: Player | undefined;
  onContentSubmitted?: () => void;
}

export function ExtremeContentForm({ roomId, player, onContentSubmitted }: ExtremeContentFormProps) {
  const [contentType, setContentType] = useState<'truth' | 'dare'>('truth');
  const [contentText, setContentText] = useState('');
  const { addExtremeContent, isLoadingModeration } = useGame();
  const { toast } = useToast();
  const MAX_LENGTH = 200;

  const handleSubmit = async () => {
    if (!player || contentText.trim() === '') {
      toast({ title: "Error", description: "Content cannot be empty.", variant: "destructive" });
      return;
    }
    if (contentText.length > MAX_LENGTH) {
      toast({ title: "Error", description: `Content too long (max ${MAX_LENGTH} chars).`, variant: "destructive" });
      return;
    }
    
    const filteredText = filterContent(contentText.trim());
    if (filteredText !== contentText.trim()) {
        toast({ title: "Content Modified", description: "Your submission contained blocked words and has been filtered.", variant: "default" });
    }


    const result = await addExtremeContent(roomId, player.id, contentType, filteredText);
    if (result.success) {
      setContentText('');
      if (onContentSubmitted) onContentSubmitted();
    } else {
      // Toast is handled by addExtremeContent in GameContext for moderation failures
      // but we can add a generic one here if needed for other types of failures.
      // toast({ title: "Submission Failed", description: result.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 rounded-lg bg-card shadow-md border border-destructive">
      <h3 className="text-lg font-headline mb-3 text-destructive flex items-center">
        <Zap className="w-5 h-5 mr-2"/> Add Extreme Content
      </h3>
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium mb-1 block">Type</Label>
          <RadioGroup
            value={contentType}
            onValueChange={(value: 'truth' | 'dare') => setContentType(value)}
            className="flex space-x-4"
            disabled={isLoadingModeration}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="truth" id="truth-type" />
              <Label htmlFor="truth-type" className="flex items-center cursor-pointer"><Lightbulb className="w-4 h-4 mr-1 text-blue-500"/>Truth</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="dare" id="dare-type" />
              <Label htmlFor="dare-type" className="flex items-center cursor-pointer"><Zap className="w-4 h-4 mr-1 text-red-500"/>Dare</Label>
            </div>
          </RadioGroup>
        </div>
        <div>
          <Label htmlFor="content-text" className="text-sm font-medium">Your {contentType}</Label>
          <Textarea
            id="content-text"
            placeholder={`Enter your custom ${contentType} here... (max ${MAX_LENGTH} chars)`}
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            className="mt-1 min-h-[80px]"
            maxLength={MAX_LENGTH}
            disabled={isLoadingModeration}
            aria-describedby="content-char-count"
          />
          <p id="content-char-count" className="text-xs text-muted-foreground mt-1 text-right">
            {contentText.length}/{MAX_LENGTH}
          </p>
        </div>
        <Button 
            onClick={handleSubmit} 
            className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground" 
            disabled={!player || contentText.trim() === '' || isLoadingModeration || contentText.length > MAX_LENGTH}
        >
          {isLoadingModeration ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Submit {contentType}
        </Button>
        {isLoadingModeration && <p className="text-xs text-muted-foreground text-center mt-2">Moderating content...</p>}
      </div>
    </div>
  );
}
