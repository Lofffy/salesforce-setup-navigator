import { ApexClassCoverage, ApexTestRunResult } from './types';

/** Joins selected class names into the comma-separated form used for deploys. */
export function commaList(classNames: string[]): string {
  return classNames.join(',');
}

function normalizeCoverage(result: ApexTestRunResult): ApexClassCoverage[] {
  const raw = result.coverage;
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && Array.isArray(raw.coverage)) {
    return raw.coverage;
  }
  return [];
}

function toNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Strips common test prefixes/suffixes and normalizes — e.g. `AccountSelectorTest` → `accountselector`. */
export function testBaseName(testClassName: string): string {
  const stripped = testClassName.replace(/^test[_-]?/i, '').replace(/[_-]?tests?$/i, '');
  return normalizeName(stripped);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * Scores how related a covered class is to the selected test classes' base names: 3 = exact match
 * (the class under test), 2 = substring containment, 1 = near match (small edit distance scaled to
 * name length — catches plural/typo variants such as AccountSelector vs AccountsSelector),
 * 0 = unrelated.
 */
export function coverageRelevance(coveredClassName: string | undefined, testBases: string[]): number {
  const cov = normalizeName(coveredClassName ?? '');
  if (!cov) {
    return 0;
  }
  let best = 0;
  for (const base of testBases) {
    if (!base) {
      continue;
    }
    if (cov === base) {
      best = Math.max(best, 3);
    } else if (cov.length >= 4 && base.length >= 4 && (cov.includes(base) || base.includes(cov))) {
      best = Math.max(best, 2);
    } else {
      const threshold = Math.floor(Math.max(cov.length, base.length) * 0.2);
      const distance = levenshtein(cov, base);
      if (distance > 0 && distance <= threshold) {
        best = Math.max(best, 1);
      }
    }
  }
  return best;
}

/**
 * Formats a test-run result into a one-line summary plus a detailed report (results + failures +
 * per-class coverage) for the output channel. Pure and unit-testable.
 */
export function formatTestRun(
  result: ApexTestRunResult,
  selectedClasses: string[],
): { summaryLine: string; detail: string } {
  const summary = result.summary ?? {};
  const tests = result.tests ?? [];
  const coverage = normalizeCoverage(result);

  const isFail = (outcome?: string) => (outcome ?? '').toLowerCase() === 'fail';
  const isPass = (outcome?: string) => (outcome ?? '').toLowerCase() === 'pass';

  const passing = toNumber(summary.passing, tests.filter((t) => isPass(t.Outcome)).length);
  const failing = toNumber(summary.failing, tests.filter((t) => isFail(t.Outcome)).length);
  const ran = toNumber(summary.testsRan, tests.length);
  const outcome = summary.outcome ?? (failing > 0 ? 'Failed' : 'Passed');

  const rule = '─'.repeat(60);
  const lines: string[] = [];
  lines.push(rule);
  lines.push(`Apex Test Run — ${outcome}`);
  lines.push(rule);
  lines.push(`Selected classes : ${selectedClasses.join(', ')}`);
  lines.push(`Tests            : ${passing} passed, ${failing} failed (of ${ran})`);
  if (summary.testTotalTime) {
    lines.push(`Time             : ${summary.testTotalTime}`);
  }
  if (summary.testRunCoverage) {
    lines.push(`Test run coverage: ${summary.testRunCoverage}`);
  }
  if (summary.orgWideCoverage) {
    lines.push(`Org-wide coverage: ${summary.orgWideCoverage}`);
  }
  if (summary.testRunId) {
    lines.push(`Test run id      : ${summary.testRunId}`);
  }

  const failures = tests.filter((t) => isFail(t.Outcome));
  if (failures.length > 0) {
    lines.push('');
    lines.push(`Failures (${failures.length}):`);
    for (const f of failures) {
      const cls = f.ApexClass?.Name ?? '';
      lines.push(`  ✖ ${f.FullName ?? `${cls}.${f.MethodName ?? ''}`}`);
      if (f.Message) {
        lines.push(indent(f.Message, '      '));
      }
      if (f.StackTrace) {
        lines.push(indent(f.StackTrace, '      '));
      }
    }
  }

  if (coverage.length > 0) {
    const bases = selectedClasses.map(testBaseName).filter((b) => b.length > 0);
    const covLine = (c: ApexClassCoverage): string => {
      const pct = typeof c.coveredPercent === 'number' ? `${Math.round(c.coveredPercent)}%` : 'n/a';
      const lineInfo = c.totalLines != null ? ` (${c.totalCovered ?? 0}/${c.totalLines} lines)` : '';
      return `  ${pct.padStart(4)}  ${c.name ?? ''}${lineInfo}`;
    };
    const byCoverageThenName = (a: ApexClassCoverage, b: ApexClassCoverage): number =>
      (a.coveredPercent ?? 0) - (b.coveredPercent ?? 0) || (a.name ?? '').localeCompare(b.name ?? '');

    const scored = coverage.map((c) => ({ c, score: coverageRelevance(c.name, bases) }));
    const related = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || byCoverageThenName(a.c, b.c))
      .map((s) => s.c);
    const other = scored
      .filter((s) => s.score === 0)
      .sort((a, b) => byCoverageThenName(a.c, b.c))
      .map((s) => s.c);

    lines.push('');
    if (related.length > 0) {
      lines.push('Code coverage — classes under test:');
      for (const c of related) {
        lines.push(covLine(c));
      }
      if (other.length > 0) {
        lines.push('');
        lines.push('Other code coverage:');
        for (const c of other) {
          lines.push(covLine(c));
        }
      }
    } else {
      lines.push('Code coverage:');
      for (const c of other) {
        lines.push(covLine(c));
      }
    }
  }

  const summaryLine = `${outcome}: ${passing} passed, ${failing} failed (${ran} tests)`;
  return { summaryLine, detail: lines.join('\n') };
}
