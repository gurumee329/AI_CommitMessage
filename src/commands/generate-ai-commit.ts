import { randomUUID } from "crypto";
import { tmpdir } from "os";
import * as path from "path";
import * as vscode from "vscode";

import { ChatgptMsgGenerator } from "@aicommitmessage/commit-msg-gen";
import {
  GitCommitMessageWriter,
  VscodeGitDiffProvider,
} from "@aicommitmessage/scm";
import { GitExtension } from "@aicommitmessage/scm/types";
import { GenerateCompletionFlow } from "@flows";
import { getConfiguration } from "@utils/configuration";
import { logToOutputChannel } from "@utils/output";
import { isValidApiKey } from "@utils/text";
import { runTaskWithTimeout } from "@utils/timer";

async function openTempFileWithMessage(message: string) {
  const uid = randomUUID();
  const tempMessageFile = path.join(
    tmpdir(),
    `vscode-aicommitmessage-${uid}.txt`
  );

  logToOutputChannel(`Opening temp file: ${tempMessageFile}`);

  const explainingHeader = `# This is a generated commit message. You can edit it and save to approve it #\n\n`;
  const tempFileContent = explainingHeader + message;

  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(tempMessageFile),
    Buffer.from(tempFileContent, "utf8")
  );

  const document = await vscode.workspace.openTextDocument(tempMessageFile);

  await vscode.window.showTextDocument(document, {
    preview: false,
  });

  let saveHandler: vscode.Disposable | undefined;
  let closeHandler: vscode.Disposable | undefined;

  const result = await new Promise<{
    result: boolean;
    edited: boolean;
    editedMessage?: string;
  }>((resolve) => {
    saveHandler = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName === tempMessageFile) {
        const editedText = doc.getText();
        const editedMessage = editedText.replace(/#.*#.*\n/g, "").trim();

        resolve({
          result: true,
          edited: true,
          editedMessage: editedMessage,
        });
      }
    });

    closeHandler = vscode.window.onDidChangeVisibleTextEditors((editors) => {
      if (
        editors.every((editor) => editor.document.fileName !== tempMessageFile)
      ) {
        resolve({
          result: false,
          edited: false,
        });
      }
    });
  });

  logToOutputChannel(`Open file result: ${JSON.stringify(result)}`);

  saveHandler?.dispose();
  closeHandler?.dispose();

  logToOutputChannel(`Deleting temp file: ${tempMessageFile}`);
  await vscode.workspace.fs.delete(vscode.Uri.file(tempMessageFile));

  return result;
}

export async function generateAiCommitCommand() {
  try {
    logToOutputChannel("Starting generateAiCommitCommand");

    const gitExtension =
      vscode.extensions.getExtension<GitExtension>("vscode.git");

    if (!gitExtension) {
      throw new Error("Git extension is not installed");
    }

    if (!gitExtension.isActive) {
      logToOutputChannel("Activating git extension");
      await gitExtension.activate();
    }

    if (!isValidApiKey()) {
      logToOutputChannel("OpenAI API Key is not set. Asking user to set it.");
      await vscode.commands.executeCommand("aicommitmessage.setOpenAIApiKey");
    }

    const configuration = getConfiguration();
    const commitMessageWriter = new GitCommitMessageWriter(gitExtension);
    const messageGenerator = new ChatgptMsgGenerator(configuration.openAI);
    const diffProvider = new VscodeGitDiffProvider(gitExtension);

    const generateCompletionFlow = new GenerateCompletionFlow(
      messageGenerator,
      diffProvider,
      commitMessageWriter
    );

    const delimeter = configuration.appearance.delimeter;

    logToOutputChannel("Running generateCompletionFlow");

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
        title: "Generating AI Commit message",
      },
      async (progress) => {
        let increment = 0;

        runTaskWithTimeout(
          () => {
            progress.report({ increment: (increment += 1) });
          },
          5000,
          200
        );

        await generateCompletionFlow.run({ delimeter });
      }
    );
  } catch (error: any) {
    // logToOutputChannel("OpenAI API error", error);

    if (error.isAxiosError && error.response?.data?.error?.message) {
      logToOutputChannel(
        `OpenAI API error: ${error.response.data.error.message}`
      );
      vscode.window.showErrorMessage(
        `OpenAI API error: ${error.response.data.error.message}`
      );
    }

    if (error instanceof Error) {
      logToOutputChannel(`Error: ${error.message}`);
      vscode.window.showErrorMessage(error.message);

      if (error.message.includes("Incorrect API key provided")) {
        logToOutputChannel(
          "Your OpenAI API key is invalid. Please set a valid API key."
        );
        vscode.window.showErrorMessage(
          "Your OpenAI API key is invalid. Please set a valid API key."
        );
        await vscode.commands.executeCommand("aicommitmessage.setOpenAIApiKey");
      }

      return;
    }

    logToOutputChannel(`Something went wrong. Please try again.`);
    vscode.window.showErrorMessage("Something went wrong. Please try again.");
    return;
  }
}
