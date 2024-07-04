// located at : src/utils/text.ts
import { getConfiguration } from "./configuration";
import { logToOutputChannel } from "./output";

export function trimNewLines(str: string, delimeter?: string) {
  const stringParts = str.split("\n");
  if (stringParts.length === 0) {
    return str;
  }

  let formattedStrings = stringParts.map((part) => part.trimStart());

  if (delimeter) {
    console.log("delimeter", delimeter);
    formattedStrings = formattedStrings.map((str) => (str ? `${delimeter} ${str}` : str));
  }

  return formattedStrings.join("\n");
}

export function isValidApiKey() {
  const configuration = getConfiguration();
  const apiKey = configuration.openAI.apiKey ?? "";
  const customEndpoint = configuration.openAI.customEndpoint?.toLowerCase();

  if (apiKey === null || apiKey === undefined || apiKey.trim().length === 0) {
    logToOutputChannel("Invalid API key", apiKey);
    return false;
  }

  const isValidPrefix = customEndpoint === "perplexity" ?
    apiKey.startsWith("pplx-") : apiKey.startsWith("sk-");

  if (!isValidPrefix) {
    logToOutputChannel("Invalid API key prefix", apiKey);
    logToOutputChannel("Expected prefix", customEndpoint);
    return false;
  }

  return true;
}
