/*
 * This code includes portions of code from the opencommit project, which is
 * licensed under the MIT License. Copyright (c) Dima Sukharev.
 * The original code can be found at https://github.com/di-sukharev/opencommit/blob/master/src/generateCommitMessageFromGitDiff.ts.
 */
import OpenAI from "openai";

import { Configuration as AppConfiguration } from "@utils/configuration";
import { trimNewLines } from "@utils/text";

import { logToOutputChannel } from "@utils/output";
import { ChatCompletionMessageParam } from "openai/resources";
import { MsgGenerator } from "./msg-generator";

function createInitMessagesPrompt(
  language: string,
  delimeter: string = '* '
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are to act as the author of a commit message in git. Your task is to generate commit messages according to Conventional Commits 1.0.0 rules. I'll send you the outputs of the 'git diff' command, and you convert it into the one commit message. Do not prefix the commit with anything and use the present tense. You should never add a description to a commit, only commit message.`,
    },
    {
      role: "user",
      content: `
Based on the following information, generate a Git commit message written in Korean, must be in Korean:

- Changes made:
  - Modified files: [list of modified files]
  - Added files: [list of added files]
  - Deleted files: [list of deleted files]
- Main purpose and reason for the changes:
  - [Explanation of the purpose and reason for the changes]

The generated message should follow these guidelines:
1. **Title:**
   - Should be 50 characters or less.
   - Use imperative mood (e.g., "Fix bug" instead of "Fixed bug").
   - Capitalize the first letter.
   - Do not end with a period.
2. **Description (if necessary):**
   - Explain what and why the changes were made.
   - Each line should be 72 characters or less.
   - List important changes if needed.

**Example:**
Title: Improve user authentication

Body:
This commit enhances the user authentication process by integrating JWT for token-based authentication. Additionally, it refines error messages to be more user-friendly in case of login failures.

Key changes:
${delimeter} Added JWT for token-based authentication
${delimeter} Improved error messages for login failures

Now, please generate a commit message based on the provided information.
`,
    },
  ];
}

function generateCommitMessageChatCompletionPrompt(
  diff: string,
  language: string,
  delimeter: string = '* '
): ChatCompletionMessageParam[] {
  const chatContextAsCompletionRequest = createInitMessagesPrompt(language,delimeter);

  chatContextAsCompletionRequest.push({
    role: "user",
    content: diff,
  });

  return chatContextAsCompletionRequest;
}

const defaultModel = "google/gemini-pro-1.5";
const defaultTemperature = 0.8;
const defaultMaxTokens = 196;

export class ChatgptMsgGenerator implements MsgGenerator {
  openAI: OpenAI;
  config?: AppConfiguration["openAI"];

  constructor(config: AppConfiguration["openAI"]) {
    let baseURL: string | undefined;
    if (config.customEndpoint) {
      const endpoint = config.customEndpoint.toLowerCase().trim();
      if (endpoint === "perplexity") {
        baseURL = "https://api.perplexity.ai";
      } else if (endpoint.startsWith("http")) {
        baseURL = endpoint;
      } else {
        baseURL = undefined;
      }
    }

    this.openAI = new OpenAI({
      baseURL: baseURL,
      apiKey: config.apiKey,
    });

    this.config = config;
  }

  async generate(diff: string, delimeter?: string) {
    const language = this.config?.language || "English";
    const messages = generateCommitMessageChatCompletionPrompt(diff, language,delimeter);
    const data = await this.openAI.chat.completions.create({
      model: this.config?.gptVersion || defaultModel,
      messages: messages,
      temperature: this.config?.temperature || defaultTemperature,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_tokens: this.config?.maxTokens || defaultMaxTokens,
    });

    const message = data?.choices[0].message;
    const commitMessage = message?.content;

    logToOutputChannel("[customEndpoint] ", this.config?.customEndpoint);
    logToOutputChannel("[model]", this.config?.gptVersion);
    logToOutputChannel("[lang]", this.config?.language);
    logToOutputChannel(
      "[Data_completion_tokens]",
      data.usage?.completion_tokens.toFixed(0)
    );
    logToOutputChannel(
      "[Data_prompt_tokens]",
      data.usage?.prompt_tokens.toFixed(0)
    );
    logToOutputChannel(
      "[Data_total_tokens]",
      data.usage?.total_tokens.toFixed(0)
    );

    if (!commitMessage) {
      throw new Error("No commit message were generated. Try again.");
    }

    return commitMessage;
  }
}
