
"use client";

import type { ChatMessage, Player } from '@/types/game';
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquare, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useGame } from '@/contexts/GameContext'; // For addChatMessage and isLoadingModeration
import { Badge } from '@/components/ui/badge';

interface ChatWindowProps {
  messages: ChatMessage[];
  roomId: string;
  currentPlayer: Player | undefined; // Current logged-in player
}

export function ChatWindow({ messages, roomId, currentPlayer }: ChatWindowProps) {
  const [inputText, setInputText] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { addChatMessage, isLoadingModeration } = useGame();

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if(scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (inputText.trim() === '' || !currentPlayer) return;

    let textToSend = inputText.trim();
    // Basic command handling (can be expanded)
    if (textToSend.startsWith('/truth ')) {
        await addChatMessage(roomId, currentPlayer.id, currentPlayer.nickname, textToSend.substring(7), 'truthAnswer');
    } else if (textToSend.startsWith('/dare completed ')) {
        await addChatMessage(roomId, currentPlayer.id, currentPlayer.nickname, `✅ Completed: ${textToSend.substring(16)}`, 'dareResult');
    } else if (textToSend.startsWith('/dare failed ')) {
        await addChatMessage(roomId, currentPlayer.id, currentPlayer.nickname, `❌ Failed: ${textToSend.substring(13)}`, 'dareResult');
    }
     else {
        await addChatMessage(roomId, currentPlayer.id, currentPlayer.nickname, textToSend);
    }
    setInputText('');
  };
  
  const getMessageTypeStyles = (type: ChatMessage['type']) => {
    switch(type) {
      case 'truthAnswer': return 'bg-blue-500/20 border-blue-500/50';
      case 'dareResult': return 'bg-green-500/20 border-green-500/50';
      case 'system':
      case 'playerJoin':
      case 'playerLeave':
      case 'turnChange':
        return 'text-xs text-center text-muted-foreground italic my-1 py-0.5';
      default: return 'bg-secondary';
    }
  }

  const getSenderStyles = (senderNickname: string, type: ChatMessage['type']) => {
     if (type === 'system' || type === 'playerJoin' || type === 'playerLeave' || type === 'turnChange') return 'font-semibold';
     return senderNickname === currentPlayer?.nickname ? 'text-accent font-semibold' : 'text-primary font-semibold';
  }

  return (
    <Card className="flex flex-col h-[400px] w-full bg-card shadow-lg">
      <CardHeader className="p-3 border-b">
        <CardTitle className="text-lg font-headline flex items-center"><MessageSquare className="w-5 h-5 mr-2 text-primary"/>Game Chat</CardTitle>
      </CardHeader>
      <ScrollArea ref={scrollAreaRef} className="flex-grow p-3 bg-background/30">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "p-2 rounded-lg text-sm",
                getMessageTypeStyles(msg.type),
                (msg.type !== 'system' && msg.type !== 'playerJoin' && msg.type !== 'playerLeave' && msg.type !== 'turnChange') && 'shadow-sm'
              )}
            >
              {(msg.type !== 'system' && msg.type !== 'playerJoin' && msg.type !== 'playerLeave' && msg.type !== 'turnChange') && (
                <div className="flex justify-between items-center mb-1">
                  <span className={cn("font-medium", getSenderStyles(msg.senderNickname, msg.type))}>
                    {msg.senderNickname}
                    {msg.senderId === currentPlayer?.id && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(msg.timestamp), 'HH:mm')}
                  </span>
                </div>
              )}
              <p className={cn("whitespace-pre-wrap", (msg.type === 'system' || msg.type === 'playerJoin' || msg.type === 'playerLeave' || msg.type === 'turnChange') && "text-center")}>{msg.text}</p>
            </div>
          ))}
          {isLoadingModeration && (
             <div className="text-center text-xs text-muted-foreground italic p-2">
                <AlertCircle className="inline w-3 h-3 mr-1 animate-spin" /> Moderating message...
             </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-3 border-t mt-auto">
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex space-x-2">
          <Input
            type="text"
            placeholder={currentPlayer ? "Type your message or /command..." : "Join game to chat"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-grow"
            disabled={!currentPlayer || isLoadingModeration}
            aria-label="Chat message input"
          />
          <Button type="submit" size="icon" disabled={!currentPlayer || inputText.trim() === '' || isLoadingModeration} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-1">Commands: /truth [answer], /dare completed [result], /dare failed [result]</p>
      </div>
    </Card>
  );
}

// Dummy Card components if not globally available or for local structure
const Card = ({className, children}: {className?:string, children: React.ReactNode}) => <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>{children}</div>
const CardHeader = ({className, children}: {className?:string, children: React.ReactNode}) => <div className={cn("flex flex-col space-y-1.5 p-6", className)}>{children}</div>
const CardTitle = ({className, children}: {className?:string, children: React.ReactNode}) => <h3 className={cn("text-2xl font-semibold leading-none tracking-tight", className)}>{children}</h3>
