
"use client";

import type { Player } from '@/types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface PlayerListProps {
  players: Player[];
  currentPlayerId: string | null;
}

export function PlayerList({ players, currentPlayerId }: PlayerListProps) {
  if (players.length === 0) {
    return <p className="text-muted-foreground text-sm">No players yet.</p>;
  }

  return (
    <ScrollArea className="w-full whitespace-nowrap rounded-md border p-3 bg-card/50">
      <div className="flex space-x-4 pb-2">
        {players.map((player) => (
          <PlayerAvatar
            key={player.id}
            player={player}
            isCurrentPlayer={player.id === currentPlayerId}
            size="md"
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
