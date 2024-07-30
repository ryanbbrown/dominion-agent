import Together from "together-ai";
import { makeAI, RESPONSE_SCHEMA } from "./base";
import { TOGETHER_API_KEY } from "./config";

const together = new Together({
    apiKey: TOGETHER_API_KEY,
});

export function togetherAI(model: string, json = false) {
    return makeAI(async (chatLog) => {
        const prediction = await together.chat.completions.create({
            model,
            max_tokens: 256,
            messages: chatLog,
            response_format: json ? { type: 'json_object', schema: RESPONSE_SCHEMA as any } : undefined,
            stream: true,
        });

        let output = '';
        for await (const chunk of prediction) {
            const text = chunk.choices[0]?.delta?.content || '';
            output += text;
            const flushed = process.stdout.write(text);
            if (!flushed) {
                await new Promise<void>((resolve) => {
                    process.stdout.once('drain', () => {
                        resolve();
                    });
                });
            }
        }

        return output;
    });
}