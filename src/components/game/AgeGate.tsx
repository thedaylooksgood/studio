
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ShieldAlert } from 'lucide-react';

const AGE_GATE_CONFIRMED_KEY = 'riskyRoomsAgeGateConfirmed';

export function AgeGate({ onConfirmed }: { onConfirmed: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const confirmed = localStorage.getItem(AGE_GATE_CONFIRMED_KEY);
    if (confirmed === 'true') {
      onConfirmed();
    } else {
      setIsOpen(true);
    }
  }, [onConfirmed]);

  const handleConfirm = () => {
    localStorage.setItem(AGE_GATE_CONFIRMED_KEY, 'true');
    setIsOpen(false);
    onConfirmed();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] bg-card border-accent" aria-labelledby="age-gate-title" aria-describedby="age-gate-description">
        <DialogHeader>
          <DialogTitle id="age-gate-title" className="text-2xl font-headline text-primary flex items-center">
            <ShieldAlert className="w-8 h-8 mr-2 text-accent" />
            Welcome to Risky Rooms!
          </DialogTitle>
          <DialogDescription id="age-gate-description" className="text-muted-foreground mt-2">
            This game contains adult themes and content intended for mature audiences. 
            By entering, you confirm that you are <strong>18 years of age or older</strong> and consent to view potentially explicit user-generated content.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 text-sm">
          <p>Player discretion is advised. User-generated content is not actively monitored in real-time by administrators, though moderation tools are in place.</p>
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = 'https://google.com'} 
            className="border-destructive text-destructive-foreground hover:bg-destructive/10"
            aria-label="Leave Risky Rooms"
            >
            I am Under 18 / Decline
          </Button>
          <Button 
            onClick={handleConfirm} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            aria-label="Confirm age and enter Risky Rooms"
            >
            I am 18+ / Accept & Enter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
