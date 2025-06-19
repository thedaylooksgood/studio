
"use client";

import type { Question } from '@/types/game';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Zap } from 'lucide-react';

interface QuestionDisplayProps {
  question: Question | null;
  onAnimationComplete?: () => void;
}

export function QuestionDisplay({ question, onAnimationComplete }: QuestionDisplayProps) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText(''); // Reset when question changes
    if (question?.text) {
      let i = 0;
      const textToDisplay = question.text;
      const intervalId = setInterval(() => {
        setDisplayedText(textToDisplay.substring(0, i + 1));
        i++;
        if (i === textToDisplay.length) {
          clearInterval(intervalId);
          if (onAnimationComplete) {
            onAnimationComplete();
          }
        }
      }, 50); // Adjust speed of typewriter effect
      return () => clearInterval(intervalId);
    }
  }, [question, onAnimationComplete]);

  if (!question) {
    return (
      <Card className="min-h-[150px] flex items-center justify-center bg-card/50 border-dashed">
        <p className="text-muted-foreground italic">Waiting for question...</p>
      </Card>
    );
  }

  const Icon = question.type === 'truth' ? HelpCircle : Zap;
  const title = question.type === 'truth' ? 'Truth Time!' : 'Dare Devil!';
  const borderColor = question.type === 'truth' ? 'border-blue-500' : 'border-red-500';
  const iconColor = question.type === 'truth' ? 'text-blue-500' : 'text-red-500';

  return (
    <Card className={`min-h-[150px] shadow-lg border-2 ${borderColor} bg-card animate-fadeIn`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-2xl font-headline flex items-center ${iconColor}`}>
          <Icon className="w-7 h-7 mr-2" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-lg font-body leading-relaxed min-h-[50px]">
          {displayedText}
          <span className="animate-ping">_</span> {/* Blinking cursor */}
        </p>
        {question.isUserSubmitted && (
          <p className="text-xs text-muted-foreground mt-3 italic">
            Submitted by: {question.submittedBy ? 'a player' : 'Unknown'} 
            {/* In a real app, you'd resolve submittedBy (playerId) to a nickname */}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
