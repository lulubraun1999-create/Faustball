
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Define the schema for the object that the prompt expects.
const summarizeRequestSchema = z.object({
  input: z.string().min(1, 'Input must not be empty.'),
});

const summarizeOutputSchema = z.string();

/**
 * The public function that components will call.
 * It takes a simple string and wraps it into the object structure the flow expects.
 */
export async function summarize(text: string): Promise<string> {
  return summarizeFlow({ input: text });
}

const summarizePrompt = ai.definePrompt(
  {
    name: 'summarizePrompt',
    // The prompt expects an object with an 'input' property.
    input: { schema: summarizeRequestSchema },
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
    // The flow's public interface now also expects the object structure.
    inputSchema: summarizeRequestSchema,
    outputSchema: summarizeOutputSchema,
  },
  async (request) => {
    // The 'request' variable is now guaranteed to be { input: string }.
    // We can pass it directly to the prompt.
    const { output } = await summarizePrompt(request);
    return output!;
  }
);
