const maybeConfig: { [key: string]: string } = {}

// uncomment this line if you'd prefer not to use env variables
// import config from "./config.json";

// Example format for config.json
// {
//     "ANTHROPIC_API_KEY": "...",
//     "OPENAI_API_KEY": "...",
//     "TOGETHER_API_KEY": "..."
// }

// @ts-ignore
if (typeof config != 'undefined') {
    // @ts-ignore
    Object.assign(maybeConfig, config);
}

export const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] || maybeConfig["ANTHROPIC_API_KEY"];
export const OPENAI_API_KEY = process.env["OPENAI_API_KEY"] || maybeConfig["OPENAI_API_KEY"];
export const TOGETHER_API_KEY = process.env["TOGETHER_API_KEY"] || maybeConfig["TOGETHER_API_KEY"];
export const DEEPSEEK_API_KEY = process.env["DEEPSEEK_API_KEY"] || maybeConfig["DEEPSEEK_API_KEY"];
