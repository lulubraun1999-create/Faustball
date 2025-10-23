'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const summarizeInputSchema = z.string().min(1, 'Input must not be empty.');
const summarizeOutputSchema = z.string();

const summarizePrompt = ai.definePrompt(
  {
    name: 'summarizePrompt',
    // The prompt correctly expects a simple string as input.
    input: { schema: summarizeInputSchema },
    output: { schema: summarizeOutputSchema },
    // The prompt template uses a special variable `prompt` to refer to the string input.
    prompt: `Fasse den folgenden Text kurz und prägnant für einen News-Feed zusammen. Konzentriere dich auf die wichtigsten Informationen.

Text:
{{{prompt}}}

Zusammenfassung:`,
  },
);

/**
 * The public function that components will call.
 * It directly invokes the configured prompt.
 */
export async function summarize(text: string): Promise<string> {
    const { output } = await summarizePrompt(text);
    return output!;
}
