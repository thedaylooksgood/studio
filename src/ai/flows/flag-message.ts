'use server';

/**
 * @fileOverview An AI agent for flagging inappropriate messages.
 *
 * - flagMessage - A function that handles the message flagging process.
 * - FlagMessageInput - The input type for the flagMessage function.
 * - FlagMessageOutput - The return type for the flagMessage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FlagMessageInputSchema = z.object({
  messageText: z.string().describe('The text content of the message to be flagged.'),
});
export type FlagMessageInput = z.infer<typeof FlagMessageInputSchema>;

const FlagMessageOutputSchema = z.object({
  flagged: z.boolean().describe('Whether the message is flagged as inappropriate.'),
  reason: z.string().describe('The reason for flagging the message.'),
});
export type FlagMessageOutput = z.infer<typeof FlagMessageOutputSchema>;

export async function flagMessage(input: FlagMessageInput): Promise<FlagMessageOutput> {
  return flagMessageFlow(input);
}

const flagMessagePrompt = ai.definePrompt({
  name: 'flagMessagePrompt',
  input: {schema: FlagMessageInputSchema},
  output: {schema: FlagMessageOutputSchema},
  prompt: `You are a content moderation expert. Your task is to determine if a given message violates community guidelines.

Here are the community guidelines:
- No hate speech or discrimination.
- No harassment or bullying.
- No sexually explicit content.
- No dangerous or illegal activities.

Message: {{{messageText}}}

Based on these guidelines, determine if the message should be flagged.

Respond in JSON format with the following schema: {\"flagged\": boolean, \"reason\": string}.  The flagged field should be true if the message violates the guidelines, and false otherwise. The reason field should explain why the message was flagged or not flagged, referencing the specific guideline(s) if applicable.`,
});

const flagMessageFlow = ai.defineFlow(
  {
    name: 'flagMessageFlow',
    inputSchema: FlagMessageInputSchema,
    outputSchema: FlagMessageOutputSchema,
  },
  async input => {
    const {output} = await flagMessagePrompt(input);
    return output!;
  }
);
