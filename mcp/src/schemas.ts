import { z } from 'zod';
import {
  FINDING_STATUSES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  REPORT_STATUSES,
  SEVERITIES,
  VERIFICATION_STATUSES,
} from '../../src/lib/domain';

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]]);
}

export const severity = enumOf(SEVERITIES);
export const findingStatus = enumOf(FINDING_STATUSES);
export const verificationStatus = enumOf(VERIFICATION_STATUSES);
export const reportStatus = enumOf(REPORT_STATUSES);
export const projectKind = enumOf(PROJECT_KINDS);
export const projectStatus = enumOf(PROJECT_STATUSES);

const uuid = z.uuid();
const date = z.iso.date();
export const limit = z.number().int().min(1).max(100).default(50);
export const offset = z.number().int().min(0).default(0);

/** UUID か PEN-0001 の形式。 */
export const findingRef = z.union([uuid, z.string().regex(/^PEN-\d{4,}$/)]);

const projectFields = {
  name: z.string().trim().min(1).max(200),
  client: z.string().max(200).nullable(),
  target: z.string().max(2000).nullable(),
  kind: projectKind,
  status: projectStatus,
  start_date: date.nullable(),
  end_date: date.nullable(),
  notes: z.string().max(20000).nullable(),
};

const { name, ...optionalProjectFields } = projectFields;

export const createProjectInput = z.strictObject({
  name,
  ...Object.fromEntries(Object.entries(optionalProjectFields).map(([key, value]) => [key, value.optional()])),
} as { name: typeof name } & { [K in keyof typeof optionalProjectFields]: z.ZodOptional<(typeof optionalProjectFields)[K]> });

export const updateProjectInput = z.strictObject({
  id: uuid,
  ...createProjectInput.partial().shape,
});

export const getByIdInput = z.strictObject({ id: uuid });

export const listProjectsInput = z.strictObject({
  status: projectStatus.optional(),
  limit,
  offset,
});

export const listFindingsInput = z.strictObject({
  project_id: uuid.optional(),
  severity: severity.optional(),
  status: findingStatus.optional(),
  verification_status: verificationStatus.optional(),
  report_status: reportStatus.optional(),
  query: z.string().max(200).optional(),
  limit,
  offset,
});

export const getFindingInput = z.strictObject({ id: findingRef });

const findingFields = {
  severity,
  status: findingStatus,
  verification_status: verificationStatus,
  report_status: reportStatus,
  report_url: z.string().max(2000).nullable(),
  reported_on: date.nullable(),
  cve: z.string().max(100).nullable(),
  cwe: z.string().max(500).nullable(),
  cvss_score: z.number().min(0).max(10).nullable(),
  cvss_vector: z.string().max(500).nullable(),
  affected_location: z.string().max(1000).nullable(),
  // 本文の 500 文字の制限は報告状況によって変わるので、guard.ts で判定する。
  description: z.string().max(200000).nullable(),
  reproduction_steps: z.string().max(200000).nullable(),
  impact: z.string().max(200000).nullable(),
  remediation: z.string().max(200000).nullable(),
  local_reference: z.string().max(500).nullable(),
};

const title = z.string().trim().min(1).max(500);

export const createFindingInput = z.strictObject({
  project_id: uuid,
  title,
  severity: findingFields.severity.optional(),
  status: findingFields.status.optional(),
  verification_status: findingFields.verification_status.optional(),
  report_status: findingFields.report_status.optional(),
  report_url: findingFields.report_url.optional(),
  reported_on: findingFields.reported_on.optional(),
  cve: findingFields.cve.optional(),
  cwe: findingFields.cwe.optional(),
  cvss_score: findingFields.cvss_score.optional(),
  cvss_vector: findingFields.cvss_vector.optional(),
  affected_location: findingFields.affected_location.optional(),
  description: findingFields.description.optional(),
  reproduction_steps: findingFields.reproduction_steps.optional(),
  impact: findingFields.impact.optional(),
  remediation: findingFields.remediation.optional(),
  local_reference: findingFields.local_reference.optional(),
});

export const updateFindingInput = z.strictObject({
  ...createFindingInput.partial().shape,
  id: findingRef,
});

export const importTrivyInput = z.strictObject({
  project_id: uuid,
  path: z.string().min(1).max(4096),
});

export const summaryInput = z.strictObject({ project_id: uuid.optional() });

export type CreateFindingInput = z.infer<typeof createFindingInput>;
export type UpdateFindingInput = z.infer<typeof updateFindingInput>;
export type CreateProjectInput = z.infer<typeof createProjectInput>;
