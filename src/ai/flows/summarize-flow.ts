'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Define the schema for the raw input string.
const summarizeInputSchema = z.string().min(1, 'Input must not be empty.');
const summarizeOutputSchema = z.string();

/**
 * The public function that components will call.
 * It takes a simple string and passes it directly to the flow.
 */
export async function summarize(text: string): Promise<string> {
  return summarizeFlow(text);
}

const summarizePrompt = ai.definePrompt(
  {
    name: 'summarizePrompt',
    // The prompt now correctly expects a simple string as input.
    input: { schema: summarizeInputSchema },
    output: { schema: summarizeOutputSchema },
    // The prompt template uses a special variable `prompt` to refer to the string input.
    prompt: `Fasse den folgenden Text kurz und prägnant für einen News-Feed zusammen. Konzentriere dich auf die wichtigsten Informationen.

Text:
{{{prompt}}}

Zusammenfassung:`,
  },
);

const summarizeFlow = ai.defineFlow(
  {
    name: 'summarizeFlow',
    // The flow's public interface is now also a simple string.
    inputSchema: summarizeInputSchema,
    outputSchema: summarizeOutputSchema,
  },
  async (text) => {
    // The 'text' variable is now guaranteed to be a non-empty string.
    // We can pass it directly to the prompt.
    const { output } = await summarizePrompt(text);
    return output!;
  }
);
