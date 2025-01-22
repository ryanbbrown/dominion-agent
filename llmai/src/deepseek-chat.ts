import OpenAI from "openai";
import { openAI } from "./openai";
import { DEEPSEEK_API_KEY } from "./config";

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: DEEPSEEK_API_KEY,
});

export const chooseMove = openAI('deepseek-chat', true, openai);