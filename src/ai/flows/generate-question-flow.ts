
'use server';
/**
 * @fileOverview An AI agent for generating explicit truth or dare questions.
 *
 * - generateQuestion - A function that handles the question generation process.
 * - GenerateQuestionInput - The input type for the generateQuestion function.
 * - GenerateQuestionOutput - The return type for the generateQuestion function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { GameMode } from '@/types/game';

const GenerateQuestionInputSchema = z.object({
  gameMode: z.enum(['minimal', 'moderate']).describe('The current game mode, influencing question intensity.'),
  questionType: z.enum(['truth', 'dare']).describe("The type of question to generate ('truth' or 'dare')."),
  playerNickname: z.string().describe("The nickname of the player for whom the question is being generated."),
  askedQuestions: z.array(z.string()).describe("A list of question texts already asked to this player for this specific type, to ensure uniqueness."),
});
export type GenerateQuestionInput = z.infer<typeof GenerateQuestionInputSchema>;

const GenerateQuestionOutputSchema = z.object({
  questionText: z.string().describe("The generated explicit and unique question/dare text."),
});
export type GenerateQuestionOutput = z.infer<typeof GenerateQuestionOutputSchema>;

export async function generateQuestion(input: GenerateQuestionInput): Promise<GenerateQuestionOutput> {
  return generateQuestionFlow(input);
}

const generateQuestionPrompt = ai.definePrompt({
  name: 'generateRiskyQuestionPrompt',
  input: { schema: GenerateQuestionInputSchema },
  output: { schema: GenerateQuestionOutputSchema },
  prompt: `You are an AI content generator for a party game called "Risky Rooms".
The game is extremely adult-themed, sexually explicit, and designed for a mature audience that enjoys "slutty" and "horny" content without boundaries.
The current game mode is '{{gameMode}}'. Your task is to generate a single, unique '{{questionType}}' question for a player named '{{playerNickname}}'.

The question must be:
- Extremely explicit and sexual.
- "Slutty" and "horny" in tone and content. Use graphic language.
- Creative, shocking, and push boundaries of conventional adult party games.
- Appropriate for the type: '{{questionType}}'.
- Examples of {{questionType}} style:
  - Truths: Deeply personal sexual confessions, detailed descriptions of past encounters or fantasies, preferences for extreme acts.
  - Dares: Physically suggestive or explicit actions involving oneself or others (if applicable, assume other players consent to game dares), public displays of "slutty" behavior within the game context, use of objects in sexual ways.

CRITICAL: DO NOT generate any of the following questions, as they have already been asked to this player for the '{{questionType}}' type:
{{#if askedQuestions.length}}
{{#each askedQuestions}}
- "{{this}}"
{{/each}}
{{else}}
(No '{{questionType}}' questions have been asked to this player yet.)
{{/if}}

IMPORTANT: Ensure the generated question is significantly different from the "already asked" list.

Output your response as a JSON object matching this schema: {"questionText": "The generated question text"}
Do not include any other commentary, acknowledgments, or formatting outside the JSON structure.
The question text itself should be a single string.
`,
  config: {
    safetySettings: [ // Be very permissive for sexual content, but block other harmful categories
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
});

const generateQuestionFlow = ai.defineFlow(
  {
    name: 'generateQuestionFlow',
    inputSchema: GenerateQuestionInputSchema,
    outputSchema: GenerateQuestionOutputSchema,
  },
  async (input) => {
    const { output } = await generateQuestionPrompt(input);
    if (!output || !output.questionText || output.questionText.trim() === "") {
      throw new Error("AI failed to generate a valid question text.");
    }
    return output;
  }
);
