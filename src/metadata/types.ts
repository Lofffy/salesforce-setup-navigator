/**
 * Supported Salesforce metadata types for the MVP.
 * The string values double as the human-facing type label used in messages.
 */
export enum MetadataType {
  ApexClass = 'Apex Class',
  ApexTrigger = 'Apex Trigger',
  VisualforcePage = 'Visualforce Page',
  Flow = 'Flow',
  CustomObject = 'Custom Object',
  CustomField = 'Custom Field',
  ValidationRule = 'Validation Rule',
}

/**
 * A resolved reference to a piece of Salesforce metadata, derived purely from a file path.
 */
export interface MetadataRef {
  /** The detected metadata type. */
  type: MetadataType;
  /** The member / developer name (e.g. `AccountService`, `Customer_Status__c`, `Require_Email`). */
  name: string;
  /** Parent object API name for object-scoped metadata (CustomObject / CustomField / ValidationRule). */
  objectApiName?: string;
  /** Absolute (or workspace-relative) path to the file that produced this reference. */
  filePath: string;
}
