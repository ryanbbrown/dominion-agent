// comment out this line if you'd prefer to use env variables
import config from "./config.json";
// {
//     "ANTHROPIC_API_KEY": "...",
//     "OPENAI_API_KEY": "...",
//     "TOGETHER_API_KEY": "..."
// }

export const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] || config["ANTHROPIC_API_KEY"];
export const OPENAI_API_KEY = process.env["OPENAI_API_KEY"] || config["OPENAI_API_KEY"];
export const TOGETHER_API_KEY = process.env["TOGETHER_API_KEY"] || config["TOGETHER_API_KEY"];
