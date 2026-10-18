import { auditKeys } from "../lib/query-keys";
import { useApiQuery } from "./helpers";
import type { AuditEntry, AuditEventType, Page } from "@leadflow/shared";

export type AuditListQuery = {
  page: number;
  pageSize: number;
  eventType?: AuditEventType;
  actorId?: string;
  from?: string;
  to?: string;
};

export function useAuditEntries(query: AuditListQuery) {
  return useApiQuery<Page<AuditEntry>>(auditKeys.list(query), "/audit", query);
}
