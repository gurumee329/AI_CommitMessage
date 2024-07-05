import { Configuration as AppConfiguration } from "@utils/configuration";
import { ChatCompletionMessageParam } from "openai/resources";
import { MsgGenerator } from "./msg-generator";
/*
 * This code includes portions of code from the opencommit project, which is
 * licensed under the MIT License. Copyright (c) Dima Sukharev.
 * The original code can be found at https://github.com/di-sukharev/opencommit/blob/master/src/generateCommitMessageFromGitDiff.ts.
 */
import OpenAI from "openai";
import { logToOutputChannel } from "@utils/output";
import { trimNewLines } from "@utils/text";

function createInitMessagesPrompt(
  language: string,
  delimeter: string = "* "
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `당신은 git의 커밋 메시지 작성자로서 행동해야 하고, ${language}을 사용해야합니다. Conventional Commits 1.0.0 규칙에 따라 커밋 메시지를 생성하는 것이 당신의 임무입니다. 가독성을 신경쓰며 적절한 개행을 하여 가이드에 충실한 커밋 메시지를 ${language} 언어로 작성하십시오. 'git diff' 명령어의 출력을 보내드릴 테니, 이를 하나의 커밋 메시지로 변환하십시오. 커밋에 아무것도 접두사로 붙이지 말고 현재형을 사용하십시오. 커밋에 설명을 추가하지 말고, 오직 커밋 메시지만 작성하십시오.`,
    },
    {
      role: "user",
      content: `
Importance of Good Commit Messages with ${language}:
Use ${delimeter} line delimeter.
Use ${language} language.
Must be line start with ${delimeter} except for the empty line and first line.

Explain the significance of clear and meaningful commit messages for both current team members and future maintainers.
Highlight how well-crafted commit messages help in understanding the context and rationale behind code changes, making development and collaboration more efficient.
Structure of a Commit Message:

Describe the standard structure, including the subject (title) and body (description).
Subject: Should be a brief summary of the change, limited to 50 characters or less, written in the imperative mood (e.g., "Add feature" not "Added feature").
Body: Provides a detailed explanation of the change, wrapped at 72 characters per line, explaining what and why the change was made.
Emphasize the importance of separating the subject from the body with a blank line.
Guidelines for Writing Commit Messages:

Imperative Mood: Use imperative mood for the subject line to match the style of auto-generated messages by commands like git merge.
Consistent Format: Follow a consistent commit message format, such as Conventional Commits.
Clarity and Brevity: Keep messages clear and to the point, avoiding unnecessary punctuation and whitespace errors.
Capitalization: Capitalize the first letter of the subject line and each paragraph in the body.
Avoid Assumptions: Do not assume the reviewer understands the original problem; provide sufficient background in the body of the message.
Examples of Good Commit Messages:

Compare poor and well-written commit messages. For example, instead of git commit -m 'Add margin', use git commit -m 'Add margin to nav items to prevent them from overlapping the logo'.
Explain why detailed commit messages are more useful for future readers and maintainers.
Introduction to Conventional Commits:

Detail the Conventional Commits format: <type>[optional scope]: <description>, with types like feat, fix, docs, etc.
Provide examples of each type:
feat: feat: add new user registration form
fix: fix: resolve null pointer exception in user service
docs: docs: update README with setup instructions
Explain the optional components like the body and footer for additional context, such as breaking changes (BREAKING CHANGE: description) or issue references (Closes #123).
Additional Tips:

Small and Focused Commits: Keep commits small and focused on a single change or related set of changes to make reviews easier.
Context for Reviewers: Provide sufficient context and background in the commit message to help reviewers understand the purpose and impact of the change.
Usage of Tools: Mention tools like commitlint for enforcing commit message conventions and GitLens for understanding commit history and context.
`,
    },
  ];
}

function generateCommitMessageChatCompletionPrompt(
  diff: string,
  language: string,
  delimeter: string = "* "
): ChatCompletionMessageParam[] {
  const chatContextAsCompletionRequest = createInitMessagesPrompt(
    language,
    delimeter
  );

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
    const messages = generateCommitMessageChatCompletionPrompt(
      diff,
      language,
      delimeter
    );
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
