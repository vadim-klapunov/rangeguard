const LIMIT = 1_000_000_000;

function analyze(text) {
    const lines = text.split(/\r?\n/);
    const rules = [];
    const issues = [];
    const names = new Set();

    let domain = null;
    let domainCount = 0;
    let contentCount = 0;
    let invalid = false;

    function report(line, message, blocking = true) {
        issues.push({ line, message });
        if (blocking) {
            invalid = true;
        }
    }

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();

        if (line === '' || line.startsWith('#')) {
            continue;
        }

        contentCount++;

        if (contentCount === 1 && !line.startsWith('domain:')) {
            report(index, 'Первая содержательная строка должна задавать domain.');
        }

        if (line.startsWith('domain:')) {
            domainCount++;

            if (domainCount > 1) {
                report(index, 'Область domain должна быть указана только один раз.');
                continue;
            }

            const match = line.match(
                /^domain:\s*(-?\d+)\s*\.\.\s*(-?\d+)$/
            );

            if (!match) {
                report(index, 'Неверный формат области. Пример: domain: 0..100');
                continue;
            }

            const min = Number(match[1]);
            const max = Number(match[2]);

            if (!validNumber(min) || !validNumber(max)) {
                report(index, `Границы должны быть целыми от -${LIMIT} до ${LIMIT}.`);
                continue;
            }

            if (min > max) {
                report(index, 'Левая граница области больше правой.');
                continue;
            }

            domain = { min, max, line: index };
            continue;
        }

        const match = line.match(
            /^([^:]+):\s*(\[|\()\s*(-?\d+)\s*,\s*(-?\d+)\s*(\]|\))$/
        );

        if (!match) {
            report(index, 'Неверный формат правила. Пример: Название: [0, 50)');
            continue;
        }

        const name = match[1].trim();
        const left = Number(match[3]);
        const right = Number(match[4]);

        if (name === '') {
            report(index, 'Название правила не должно быть пустым.');
            continue;
        }

        if (names.has(name)) {
            report(index, `Название «${name}» уже используется.`);
            continue;
        }

        names.add(name);

        if (!validNumber(left) || !validNumber(right)) {
            report(index, `Границы должны быть целыми от -${LIMIT} до ${LIMIT}.`);
            continue;
        }

        if (left > right) {
            report(index, `У правила «${name}» левая граница больше правой.`);
            continue;
        }

        const min = left + (match[2] === '(' ? 1 : 0);
        const max = right - (match[5] === ')' ? 1 : 0);

        if (min > max) {
            report(index, `Диапазон «${name}» не содержит целых чисел.`);
            continue;
        }

        rules.push({ name, min, max, line: index });
    }

    if (domainCount === 0) {
        report(0, 'Не задана область domain.');
    }

    if (rules.length === 0) {
        report(0, 'Необходимо хотя бы одно корректное правило.');
    }

    if (invalid || domain === null) {
        return { domain, rules, issues, valid: false };
    }

    const clipped = [];

    for (const rule of rules) {
        if (rule.min < domain.min || rule.max > domain.max) {
            report(
                rule.line,
                `Правило «${rule.name}» выходит за область ${segment(domain.min, domain.max)}.`,
                false
            );
        }

        const min = Math.max(rule.min, domain.min);
        const max = Math.min(rule.max, domain.max);

        if (min <= max) {
            clipped.push({ ...rule, min, max });
        }
    }

    clipped.sort((first, second) =>
        first.min - second.min || first.max - second.max
    );

    for (let i = 0; i < clipped.length; i++) {
        for (let j = i + 1; j < clipped.length; j++) {
            const first = clipped[i];
            const second = clipped[j];

            if (second.min > first.max) {
                break;
            }

            const min = Math.max(first.min, second.min);
            const max = Math.min(first.max, second.max);
            const message =
                `Пересечение «${first.name}» и «${second.name}»: ${segment(min, max)}.`;

            report(first.line, message, false);
            report(second.line, message, false);
        }
    }

    let next = domain.min;

    for (const rule of clipped) {
        if (rule.min > next) {
            report(
                domain.line,
                `Пропуск: ${segment(next, rule.min - 1)}.`,
                false
            );
        }

        next = Math.max(next, rule.max + 1);
    }

    if (next <= domain.max) {
        report(
            domain.line,
            `Пропуск: ${segment(next, domain.max)}.`,
            false
        );
    }

    return { domain, rules, issues, valid: true };
}

function validNumber(value) {
    return Number.isSafeInteger(value) && Math.abs(value) <= LIMIT;
}

function segment(min, max) {
    return min === max ? String(min) : `[${min}, ${max}]`;
}

function findMatchingRules(result, value) {
    if (
        !result.valid ||
        !validNumber(value) ||
        value < result.domain.min ||
        value > result.domain.max
    ) {
        return [];
    }

    return result.rules.filter(
        rule => value >= rule.min && value <= rule.max
    );
}

module.exports = { analyze, findMatchingRules, validNumber };