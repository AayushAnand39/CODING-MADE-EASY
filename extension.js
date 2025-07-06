const vscode = require('vscode');

let snippetMap = new Map(); // keyword -> { language, code }

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  // Load persisted snippets from globalState
  const stored = context.globalState.get('userSnippets');
  if (stored && typeof stored === 'object') {
    for (const [key, obj] of Object.entries(stored)) {
      snippetMap.set(key, obj);
    }
  }

  // Command: create or edit a snippet
  const createCmd = vscode.commands.registerCommand(
    'extension.createSnippet',
    async () => {
      // 1) pick language
      const languages = ['cpp','javascript','python','java','c','csharp','go','ruby'];
      const language = await vscode.window.showQuickPick(languages, {
        placeHolder: 'Select snippet language'
      });
      if (!language) {
        return vscode.window.showWarningMessage('Snippet creation cancelled.');
      }

      // 2) ask for trigger keyword
      const keyword = await vscode.window.showInputBox({
        prompt: 'Enter the snippet trigger keyword'
      });
      if (!keyword) {
        return vscode.window.showWarningMessage('Snippet creation cancelled.');
      }

      // 3) open a new untitled document with that language
      const existing = snippetMap.get(keyword);
      const initial = existing ? existing.code
        : `// Write your ${language} snippet for '${keyword}' here\n`;
      const doc = await vscode.workspace.openTextDocument({
        language,
        content: initial
      });
      await vscode.window.showTextDocument(doc);

      // 4) prompt user to save once done editing
      const saveChoice = 'Save Snippet';
      const selection = await vscode.window.showInformationMessage(
        `When you’re done editing, click “${saveChoice}” in the notification bar.`,
        saveChoice
      );
      if (selection === saveChoice) {
        const code = doc.getText();
        // update in-memory map
        snippetMap.set(keyword, { language, code });
        // persist to globalState
        const toStore = {};
        for (const [k, val] of snippetMap.entries()) {
          toStore[k] = val;
        }
        await context.globalState.update('userSnippets', toStore);
        vscode.window.showInformationMessage(
          `Snippet '${keyword}' saved for language ${language}.`
        );
      }
    }
  );

  // Completion provider for persisted snippets
  const provider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: '*' },
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position).text.slice(0, position.character);
        const word = line.split(/\s+/).pop();
        const items = [];

        for (const [key, { language, code }] of snippetMap.entries()) {
          if (
            key.toLowerCase().startsWith(word.toLowerCase()) &&
            document.languageId === language
          ) {
            const item = new vscode.CompletionItem(
              key,
              vscode.CompletionItemKind.Snippet
            );
            item.insertText = new vscode.SnippetString(code);
            item.detail = `User snippet (${language})`;
            items.push(item);
          }
        }
        return items;
      }
    },
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  );

  context.subscriptions.push(createCmd, provider);
}

function deactivate() {}

module.exports = { activate, deactivate };
