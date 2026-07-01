/** Parsed shape of `sf apex run test --json --code-coverage` (only the fields we use). */
export interface ApexTestSummary {
  outcome?: string;
  testsRan?: number;
  passing?: number;
  failing?: number;
  skipped?: number;
  testTotalTime?: string;
  testRunId?: string;
  testRunCoverage?: string;
  orgWideCoverage?: string;
}

export interface ApexTestMethodResult {
  Outcome?: string;
  MethodName?: string;
  Message?: string | null;
  StackTrace?: string | null;
  RunTime?: number;
  FullName?: string;
  ApexClass?: { Name?: string };
}

export interface ApexClassCoverage {
  name?: string;
  coveredPercent?: number;
  totalLines?: number;
  totalCovered?: number;
}

export interface ApexTestRunResult {
  summary?: ApexTestSummary;
  tests?: ApexTestMethodResult[];
  /** `coverage` may be an array, or an object wrapping a `coverage` array, depending on CLI version. */
  coverage?: { coverage?: ApexClassCoverage[] } | ApexClassCoverage[];
}
