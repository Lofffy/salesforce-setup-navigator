/** A single record returned by a Salesforce (Tooling/REST) SOQL query. */
export interface SfRecord {
  Id?: string;
  [key: string]: unknown;
}

/** Runs a Tooling-API SOQL query and resolves to the matched records. */
export type ToolingQuery = (soql: string) => Promise<SfRecord[]>;
