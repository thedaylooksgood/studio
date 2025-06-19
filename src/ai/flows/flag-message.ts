
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
  prompt: `You are a content moderation expert for an adult-themed party game. Your task is to determine if a given message violates critical community guidelines. Sexually explicit, suggestive, horny, and slutty content related to the game's theme is PERMITTED.

Focus on these critical community guidelines:
- No hate speech or discrimination.
- No harassment or bullying.
- No dangerous or illegal activities (e.g., depiction or promotion of non-consensual acts, illegal substances).

Message: {{{messageText}}}

Based on these critical guidelines, determine if the message should be flagged. If it's only sexually explicit in a way that fits an adult party game, it should NOT be flagged.

Respond in JSON format with the following schema: {\"flagged\": boolean, \"reason\": string}. The flagged field should be true if the message violates the critical guidelines, and false otherwise. The reason field should explain why the message was flagged or not flagged, referencing the specific critical guideline(s) if applicable. If not flagged, the reason can be "Content is permissible within game guidelines."`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE', 
      },
    ],
  },
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
