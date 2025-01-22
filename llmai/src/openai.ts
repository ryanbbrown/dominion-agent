import { makeAI, makeAIOptions } from "./base";
import OpenAI from "openai";
import { OPENAI_API_KEY } from "./config";

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

export function openAI(model: string, json = false, api = openai, options?: makeAIOptions) {
    return makeAI(async (chatLog) => {
        const prediction = await api.chat.completions.create({
            model,
            max_tokens: 512,
            messages: chatLog,
            response_format: json ? { type: "json_object" } : undefined,
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
    }, options);
}