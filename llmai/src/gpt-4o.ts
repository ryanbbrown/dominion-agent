import { openAI } from "./openai";

export const chooseMove = openAI('gpt-4o', true);