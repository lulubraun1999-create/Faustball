
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Define the schema for the input, ensuring it's a non-empty string.
const summarizeInputSchema = z.string().min(1, 'Input must not be empty.');
const summarizeOutputSchema = z.string();

/**
 * Defines the core AI prompt for summarization.
 * It expects a simple string as input, which is referenced in the template
 * using the special '{{{prompt}}}' Handlebars variable.
 */
const summarizePrompt = ai.definePrompt(
  {
    name: 'summarizePrompt',
    input: { schema: summarizeInputSchema },
    output: { schema: summarizeOutputSchema },
    prompt: `Fasse den folgenden Text kurz und prägnant für einen News-Feed zusammen. Konzentriere dich auf die wichtigsten Informationen.

Text:
{{{prompt}}}

Zusammenfassung:`,
  },
);

/**
 * The public function that components will call.
 * It directly invokes the configured prompt with the provided text.
 */
export async function summarize(text: string): Promise<string> {
    const { output } = await summarizePrompt(text);
    return output!;
}
