const vscode = require('vscode');
const fetch = require('node-fetch');

let snippetMap = new Map();

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  const savedUrl = context.globalState.get('githubRepoUrl');

  if (savedUrl) {
    vscode.window.showInformationMessage(`Loading snippets from saved repo: ${savedUrl}`);
    const snippets = await fetchSnippetList(savedUrl);
    for (const [key, url] of snippets) {
      snippetMap.set(key, url);
    }
  } else {
    vscode.window.showWarningMessage('No GitHub repo initialized. Run "Initialize Snippet Repo" command.');
  }

  // Command to manually initialize
  const loadCommand = vscode.commands.registerCommand('extension.loadSnippets', async () => {
    const repoUrl = await vscode.window.showInputBox({
      prompt: 'Enter GitHub repo URL (e.g., https://github.com/your/snippets)'
    });
    if (!repoUrl) return;

    const snippets = await fetchSnippetList(repoUrl);
    snippetMap.clear();
    snippets.forEach(([key, url]) => snippetMap.set(key, url));
    context.globalState.update('githubRepoUrl', repoUrl); // Save for future use
    vscode.window.showInformationMessage(`Snippets loaded and saved for future use.`);
  });

  // Completion provider
  const provider = vscode.languages.registerCompletionItemProvider(
    { language: 'cpp' },
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position).text;
        const word = line.slice(0, position.character).split(/\s+/).pop();

        const suggestions = [];
        for (const [key, url] of snippetMap.entries()) {
          if (key.startsWith(word.toLowerCase())) {
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Snippet);
            item.detail = 'GitHub snippet';
            item.insertText = ''; // Insert later via command
            item.command = {
              command: 'extension.insertSnippetFromGitHub',
              title: 'Insert Snippet',
              arguments: [url]
            };
            suggestions.push(item);
          }
        }
        return suggestions;
      }
    },
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  );

  const insertCommand = vscode.commands.registerCommand('extension.insertSnippetFromGitHub', async (url) => {
    try {
      const res = await fetch(url);
      const code = await res.text();
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.insertSnippet(new vscode.SnippetString(code));
      }
    } catch (err) {
      vscode.window.showErrorMessage('Failed to insert snippet.');
    }
  });

  context.subscriptions.push(loadCommand, provider, insertCommand);
}

exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;

// Fetch list of .cpp files from the GitHub repo and return [key, download_url] pairs
async function fetchSnippetList(repoUrl) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    vscode.window.showErrorMessage('Invalid GitHub URL');
    return [];
  }

  const [, owner, repo] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/`;

  try {
    const res = await fetch(apiUrl);
    const files = await res.json();
    const snippetList = [];

    for (const file of files) {
      if (file.name.endsWith('.cpp')) {
        const key = file.name.replace('.cpp', '').toLowerCase();
        snippetList.push([key, file.download_url]);
      }
    }

    return snippetList;
  } catch (err) {
    vscode.window.showErrorMessage('Failed to fetch GitHub files.');
    return [];
  }
}
