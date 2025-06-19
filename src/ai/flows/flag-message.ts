
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
  prompt: `You are a content moderation AI for an extremely adult-themed, sexually explicit party game called "Risky Rooms". Your primary function is to ensure player safety by flagging messages that violate CRITICAL community guidelines ONLY. The game's explicit nature means that ALL FORMS of consensual, adult, sexual, horny, slutty, and even taboo-themed language related to the game's context are ABSOLUTELY PERMITTED and ENCOURAGED. Do NOT flag content merely for being sexually graphic, vulgar, or shocking.\n\nYour ONLY task is to identify and flag violations of these specific critical guidelines:\n1. Hate Speech or Discrimination: Attacks or demeans individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, etc.\n2. Harassment or Bullying: Targeted, repeated, or severe abuse directed at an individual player.\n3. Promotion of Illegal or Non-Consensual Acts: Explicitly encouraging or detailing real-world illegal activities (e.g., illegal drug use beyond game fantasy) or, CRITICALLY, any depiction or endorsement of non-consensual sexual acts.\n\nMessage to analyze: {{{messageText}}}\n\nBased *solely* on the critical guidelines above, determine if the message should be flagged. If the message is only sexually explicit, no matter how graphic or "slutty," it should NOT be flagged. The game thrives on this.\n\nRespond in JSON format with the following schema: {\"flagged\": boolean, \"reason\": string}. \n- 'flagged': true if it violates one of the three CRITICAL guidelines, false otherwise.\n- 'reason': If flagged, clearly state WHICH critical guideline was violated. If not flagged, the reason MUST be "Content is permissible and encouraged within game guidelines."`,
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
