
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AgeGate } from '@/components/game/AgeGate';
import { Zap, Users, LogIn, PlusCircle } from 'lucide-react';

export default function HomePage() {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); // Ensure component is mounted on client before checking localStorage
    // AgeGate will handle checking localStorage and calling onConfirmed
  }, []);

  const handleAgeConfirmed = () => {
    setAgeConfirmed(true);
  };

  if (!isClient) {
    // Render nothing or a loader until client-side check is done
    return <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">Loading...</div>;
  }

  if (!ageConfirmed) {
    return <AgeGate onConfirmed={handleAgeConfirmed} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center animate-fadeIn">
      <header className="mb-12">
        <h1 className="text-7xl font-headline font-bold text-primary mb-2 flex items-center justify-center">
          <Zap className="w-16 h-16 mr-3 text-accent transform -rotate-12" />
          Risky Rooms
          <Zap className="w-16 h-16 ml-3 text-accent transform rotate-12" />
        </h1>
        <p className="text-xl text-muted-foreground font-body">The ultimate Truth or Dare party game.</p>
      </header>

      <main className="space-y-6 w-full max-w-xs">
        <Link href="/create" passHref>
          <Button 
            size="lg" 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transform hover:scale-105 transition-transform duration-150"
            aria-label="Create a new game room"
          >
            <PlusCircle className="mr-2 h-5 w-5" /> Create Room
          </Button>
        </Link>
        <Link href="/join" passHref>
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full border-accent text-accent hover:bg-accent/10 hover:text-accent shadow-lg transform hover:scale-105 transition-transform duration-150"
            aria-label="Join an existing game room"
          >
            <LogIn className="mr-2 h-5 w-5" /> Join Room
          </Button>
        </Link>
      </main>

      <footer className="mt-16 text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Risky Rooms. Play responsibly.</p>
        <p className="mt-1">
          <Users className="inline w-4 h-4 mr-1" /> For mature audiences only (18+).
        </p>
      </footer>
    </div>
  );
}
