import { LMStudioClient } from "@lmstudio/sdk";

const client = new LMStudioClient(
  // { baseUrl: "ws://192.168.86.50:1234" },
);

import { makeAI, RESPONSE_SCHEMA } from "./base";

export const chooseMove = makeAI(async (chatLog) => {
  const model = await client.llm.get({});
  const prediction = model.respond(chatLog, {
    maxPredictedTokens: 256,
    structured: { type: "json", jsonSchema: RESPONSE_SCHEMA },
  });

  for await (const text of prediction) {
    const flushed = process.stdout.write(text);
    if (!flushed) {
      await new Promise<void>((resolve) => {
        process.stdout.once('drain', () => {
          resolve();
        });
      });
    }
  }

  return (await prediction).content;
});
