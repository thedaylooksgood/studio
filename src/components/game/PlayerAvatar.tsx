
"use client";

import type { Player } from '@/types/game';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

interface PlayerAvatarProps {
  player: Player;
  isCurrentPlayer?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-lg',
};

export function PlayerAvatar({ player, isCurrentPlayer = false, size = 'md' }: PlayerAvatarProps) {
  const initials = player.nickname.substring(0, 2).toUpperCase();

  return (
    <div className="flex flex-col items-center space-y-1">
      <div
        className={cn(
          'rounded-full flex items-center justify-center bg-secondary text-secondary-foreground font-bold border-2 border-transparent relative overflow-hidden shadow-md',
          sizeClasses[size],
          isCurrentPlayer && 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-background animate-player-select-glow shadow-accent/50'
        )}
        title={player.nickname}
      >
        {initials || <User className={cn(size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-8 h-8')} />}
        {player.isHost && (
          <span 
            className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 text-[0.6rem] leading-none shadow"
            title="Host"
            aria-label="Host indicator"
            >
            👑
          </span>
        )}
      </div>
      <p className={cn("text-xs truncate max-w-[60px]", isCurrentPlayer && "font-bold text-accent")}>{player.nickname}</p>
    </div>
  );
}
