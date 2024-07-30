import Anthropic from '@anthropic-ai/sdk';
import { makeAI, SYSTEM_PROMPT } from "./base";
import { MessageParam } from '@anthropic-ai/sdk/resources';
import { ANTHROPIC_API_KEY } from './config';

const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
});

export function anthropicAI(model: string) {
    return makeAI(async (chatLog) => {
        const mergedChatLog: MessageParam[] = [
            { 'role': 'user', 'content': chatLog.map(_ => _.content).slice(1).join('\n\n') },
        ];

        const prediction = await anthropic.messages.create({
            model,
            max_tokens: 256,
            system: SYSTEM_PROMPT,
            messages: mergedChatLog,
        });

        const result = prediction.content[0];
        if (!result || result.type != 'text') {
            throw new Error('Got an unexpected result from Anthropic');
        }

        console.log(result.text);
        return result.text;
    });
}