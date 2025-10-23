
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Define schemas as local constants, not exported, to satisfy 'use server' constraints.
const summarizeInputSchema = z.string().min(1, 'Input must not be empty.');
const summarizeOutputSchema = z.string();


export async function summarize(text: string): Promise<string> {
    // The public function calls the flow.
    return summarizeFlow(text);
}

const summarizePrompt = ai.definePrompt(
  {
    name: 'summarizePrompt',
    // The prompt itself expects an object with an 'input' property, matching the Handlebars template.
    input: { schema: z.object({ input: summarizeInputSchema }) },
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
    // The flow's public interface takes a plain string.
    inputSchema: summarizeInputSchema,
    outputSchema: summarizeOutputSchema,
  },
  async (input) => {
    // **FIX:** Pass the input string wrapped in an object to match the prompt's schema.
    const { output } = await summarizePrompt({ input });
    return output!;
  }
);
