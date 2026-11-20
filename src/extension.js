const vscode = require('vscode');
const {
    analyze,
    findMatchingRules,
    validNumber
} = require('./analyzer');

function activate(context) {
    const diagnostics =
        vscode.languages.createDiagnosticCollection('rangeguard');

    context.subscriptions.push(diagnostics);

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
    
    const valueCommand = vscode.commands.registerCommand(
        'rangeguard.checkValue',
        async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor || editor.document.languageId !== 'ranges') {
                vscode.window.showWarningMessage(
                    'Откройте файл .ranges для проверки значения.'
                );
                return;
            }

            const document = editor.document;

            const input = await vscode.window.showInputBox({
                title: 'RangeGuard: Проверить значение',
                prompt: 'Введите целое число от -1000000000 до 1000000000',
                placeHolder: 'Например: 1000',
                validateInput: text => {
                    const trimmed = text.trim();

                    if (
                        !/^-?\d+$/.test(trimmed) ||
                        !validNumber(Number(trimmed))
                    ) {
                        return 'Введите целое число в указанном диапазоне.';
                    }

                    return null;
                }
            });

            if (input === undefined) {
                return;
            }

            if (document.isClosed) {
                vscode.window.showWarningMessage(
                    'Документ закрыт. Откройте файл и повторите команду.'
                );
                return;
            }

            const result = checkDocument(document);

            if (!result || !result.valid) {
                vscode.window.showWarningMessage(
                    'Сначала исправьте ошибки формата и границ диапазонов.'
                );
                return;
            }

            const value = Number(input.trim());

            if (
                value < result.domain.min ||
                value > result.domain.max
            ) {
                vscode.window.showWarningMessage(
                    `Значение ${value} находится вне общей области ` +
                    `[${result.domain.min}, ${result.domain.max}].`
                );
                return;
            }

            const matches = findMatchingRules(result, value);

            if (matches.length === 0) {
                vscode.window.showWarningMessage(
                    `Для значения ${value} подходящих правил нет — это пропуск.`
                );
            } else if (matches.length === 1) {
                vscode.window.showInformationMessage(
                    `${value} → ${matches[0].name}`
                );
            } else {
                const names = matches.map(rule => rule.name).join(', ');

                vscode.window.showWarningMessage(
                    `${value} → пересечение правил: ${names}.`
                );
            }
        }
    );

    context.subscriptions.push(valueCommand);

    const exportCommand = vscode.commands.registerCommand(
        'rangeguard.exportReport',
        async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor || editor.document.languageId !== 'ranges') {
                vscode.window.showWarningMessage(
                    'Откройте файл .ranges для создания отчёта.'
                );
                return;
            }

            const document = editor.document;
            const result = checkDocument(document);

            function escapeMarkdown(text) {
                return String(text)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1')
                    .replace(/\r?\n/g, ' ');
            }

            const lines = [
                '# Отчёт RangeGuard',
                '',
                `Документ: ${escapeMarkdown(document.fileName)}`,
                '',
                `Дата проверки: ${new Date().toISOString()}`,
                '',
                'Проверено текущее содержимое редактора, включая несохранённые изменения.',
                '',
                '## Результат',
                ''
            ];

            if (!result.valid) {
                lines.push(
                    'Проверка покрытия и пересечений не выполнена: ' +
                    'сначала необходимо исправить ошибки входных данных.'
                );
            } else if (result.issues.length === 0) {
                lines.push(
                    'Ошибок не найдено. Каждое целое число общей области ' +
                    'принадлежит ровно одному правилу.'
                );
            } else {
                lines.push('Проверка выполнена. Обнаружены проблемы.');
            }

            if (result.domain) {
                lines.push(
                    '',
                    `Общая область: [${result.domain.min}, ${result.domain.max}].`
                );
            }

            lines.push(
                '',
                '## Распознанные правила',
                '',
                'Границы ниже включены и приведены к целым значениям.',
                ''
            );

            if (result.rules.length === 0) {
                lines.push('Корректные правила не распознаны.');
            } else {
                for (const rule of result.rules) {
                    lines.push(
                        `- Строка ${rule.line + 1}: ` +
                        `${escapeMarkdown(rule.name)} — ` +
                        `[${rule.min}, ${rule.max}].`
                    );
                }
            }

            lines.push(
                '',
                '## Диагностические сообщения',
                ''
            );

            if (result.issues.length === 0) {
                lines.push('Сообщений нет.');
            } else {
                lines.push(
                    `Количество сообщений: ${result.issues.length}.`,
                    '',
                    'Одно пересечение отмечается на обеих участвующих строках.',
                    ''
                );

                for (const issue of result.issues) {
                    lines.push(
                        `- Строка ${issue.line + 1}: ` +
                        escapeMarkdown(issue.message)
                    );
                }
            }

            const report = await vscode.workspace.openTextDocument({
                language: 'markdown',
                content: lines.join('\n') + '\n'
            });

            await vscode.window.showTextDocument(report);

            vscode.window.showInformationMessage(
                'Отчёт создан. Нажмите Ctrl+S, чтобы сохранить его.'
            );
        }
    );

    context.subscriptions.push(exportCommand);

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

    for (const document of vscode.workspace.textDocuments) {
        checkDocument(document);
    }
}

module.exports = { activate };  