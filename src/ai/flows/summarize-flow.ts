
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Define schemas as local constants, not exported.
const summarizeInputSchema = z.string();
const summarizeOutputSchema = z.string();

export async function summarize(text: string): Promise<string> {
    return summarizeFlow(text);
}

const summarizePrompt = ai.definePrompt(
  {
    name: 'summarizePrompt',
    // Use the locally defined schemas here.
    input: { schema: summarizeInputSchema },
    output: { schema: summarizeOutputSchema },
    prompt: `Fasse den folgenden Text kurz und prägnant für einen News-Feed zusammen. Konzentriere dich auf die wichtigsten Informationen.

Text:
{{{input}}}

Zusammenfassung:`,
  },
);

const summarizeFlow = ai.defineFlow(
  {
    name: 'summarizeFlow',
    inputSchema: summarizeInputSchema,
    outputSchema: summarizeOutputSchema,
  },
  async (input) => {
    const { output } = await summarizePrompt(input);
    return output!;
  }
);
