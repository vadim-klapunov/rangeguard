const vscode = require('vscode');
const { analyze } = require('./analyzer');

/**
 * Подключает команды и автоматическую проверку документов.
 * @param {vscode.ExtensionContext} context — контекст расширения.
 */
function activate(context) {
    const diagnostics =
        vscode.languages.createDiagnosticCollection('rangeguard');

    context.subscriptions.push(diagnostics);

    /**
     * Проверяет документ и обновляет сообщения в редакторе.
     * @param {vscode.TextDocument} document — проверяемый документ.
     * @returns {object|null} Результат анализа или null для другого языка.
     */
    function checkDocument(document) {
        if (document.languageId !== 'ranges') {
            return null;
        }

        const result = analyze(document.getText());

        const messages = result.issues.map(issue => {
            const lineNumber = Math.max(
                0,
                Math.min(issue.line, document.lineCount - 1)
            );

            const range = document.lineAt(lineNumber).range;

            const diagnostic = new vscode.Diagnostic(
                range,
                issue.message,
                vscode.DiagnosticSeverity.Error
            );

            diagnostic.source = 'RangeGuard';
            return diagnostic;
        });

        diagnostics.set(document.uri, messages);
        return result;
    }

    const checkCommand = vscode.commands.registerCommand(
        'rangeguard.check',
        () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor || editor.document.languageId !== 'ranges') {
                vscode.window.showWarningMessage(
                    'Откройте файл .ranges для проверки.'
                );
                return;
            }

            const result = checkDocument(editor.document);

            if (result.issues.length === 0) {
                vscode.window.showInformationMessage(
                    'RangeGuard: ошибок не найдено.'
                );
            } else {
                vscode.window.showWarningMessage(
                    `RangeGuard: диагностических сообщений — ${result.issues.length}.`
                );

                vscode.commands.executeCommand(
                    'workbench.actions.view.problems'
                );
            }
        }
    );

    context.subscriptions.push(
        checkCommand,

        vscode.workspace.onDidOpenTextDocument(checkDocument),

        vscode.workspace.onDidSaveTextDocument(checkDocument),

        vscode.workspace.onDidCloseTextDocument(document => {
            diagnostics.delete(document.uri);
        })
    );

    // Проверяем документы, которые открыты до активации расширения.
    for (const document of vscode.workspace.textDocuments) {
        checkDocument(document);
    }
}

module.exports = { activate };  