
"use client";

import type { GameMode } from '@/types/game';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Flame, AlertTriangle } from 'lucide-react';

interface ModeSelectorProps {
  selectedMode: GameMode;
  onModeChange: (mode: GameMode) => void;
}

const modes: { value: GameMode; label: string; description: string; icon: React.ElementType, warning?: string, iconColor?: string }[] = [
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'PG-13 questions. Safe for all (adult) audiences.',
    icon: Shield,
    iconColor: 'text-green-500',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    description: 'Edgy adult content. Expect some spice!',
    icon: Flame,
    iconColor: 'text-orange-500',
  },
  {
    value: 'extreme',
    label: 'Extreme',
    description: 'User-submitted explicit content. No boundaries!',
    icon: AlertTriangle,
    warning: 'Potentially offensive content. Player discretion strongly advised.',
    iconColor: 'text-red-500',
  },
];

export function ModeSelector({ selectedMode, onModeChange }: ModeSelectorProps) {
  return (
    <RadioGroup value={selectedMode} onValueChange={(value) => onModeChange(value as GameMode)} className="space-y-4">
      {modes.map((mode) => (
        <Label key={mode.value} htmlFor={mode.value} className="cursor-pointer">
          <Card className={`transition-all duration-200 ease-in-out hover:shadow-lg hover:border-primary ${selectedMode === mode.value ? 'border-2 border-primary shadow-xl' : 'border-border'}`}>
            <CardHeader className="flex flex-row items-center space-x-3 p-4">
              <RadioGroupItem value={mode.value} id={mode.value} className="sr-only" />
              <mode.icon className={`w-8 h-8 ${mode.iconColor || 'text-primary'}`} />
              <div>
                <CardTitle className="text-lg font-headline">{mode.label}</CardTitle>
                <CardDescription className="text-sm">{mode.description}</CardDescription>
              </div>
            </CardHeader>
            {mode.warning && selectedMode === mode.value && (
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
                  {mode.warning}
                </p>
              </CardContent>
            )}
          </Card>
        </Label>
      ))}
    </RadioGroup>
  );
}
