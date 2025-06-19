
"use client";

import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { TimerIcon } from 'lucide-react';

interface TimerProps {
  duration: number; // in seconds
  onTimeUp: () => void;
  isActive: boolean;
  title?: string;
  resetKey?: string | number; // Change this key to reset the timer
}

export function Timer({ duration, onTimeUp, isActive, title = "Time Remaining", resetKey }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    setTimeLeft(duration); // Reset timer when resetKey or duration changes
  }, [resetKey, duration]);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) {
      if (isActive && timeLeft <= 0) {
        onTimeUp();
      }
      return;
    }

    const intervalId = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isActive, timeLeft, onTimeUp]);

  const progressPercentage = (timeLeft / duration) * 100;

  return (
    <div className="p-4 rounded-lg bg-card shadow-md border border-border w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center">
          <TimerIcon className="w-4 h-4 mr-2 text-primary" />
          {title}
        </h4>
        <span className="text-lg font-bold text-primary font-mono">
          {Math.max(0, timeLeft)}s
        </span>
      </div>
      <Progress value={progressPercentage} aria-label={`${title}: ${timeLeft} seconds remaining`} className="h-3 [&>div]:bg-primary" />
      {!isActive && timeLeft === duration && <p className="text-xs text-muted-foreground mt-1 italic text-center">Timer paused.</p>}
      {isActive && timeLeft <= 10 && timeLeft > 0 && <p className="text-xs text-red-500 mt-1 font-semibold text-center animate-pulse">Hurry up!</p>}
       {timeLeft <= 0 && <p className="text-xs text-destructive mt-1 font-bold text-center">Time's up!</p>}
    </div>
  );
}
