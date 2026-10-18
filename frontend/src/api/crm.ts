import { api, apiDownload, type QueryValue } from "../lib/api-client";
import {
  companyKeys,
  contactKeys,
  opportunityKeys,
  savedListKeys,
} from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  Company,
  Contact,
  ContactFullView,
  CreateCompanyInput,
  CreateContactInput,
  CreateNoteInput,
  CreateOpportunityInput,
  CreateSavedListInput,
  Activity,
  Opportunity,
  Page,
  SavedList,
  UpdateCompanyInput,
  UpdateContactInput,
  UpdateOpportunityInput,
} from "@leadflow/shared";

export type PageQuery = { page: number; pageSize: number; q?: string; sort?: string };
export type ContactListQuery = PageQuery & { ownerId?: string; companyId?: string; tag?: string };
export type OpportunityListQuery = Record<string, QueryValue>;

export function useCompanies(query: PageQuery) {
  return useApiQuery<Page<Company>>(companyKeys.list(query), "/companies", query);
}

export function useCompany(id: string | undefined) {
  return useApiQuery<Company>(companyKeys.detail(id ?? "none"), `/companies/${id}`, undefined, {
    enabled: Boolean(id),
  });
}

export function useCreateCompany() {
  return useApiMutation<CreateCompanyInput, Company>(
    (input) => api.post<Company>("/companies", input),
    { invalidate: [companyKeys.list()] },
  );
}

export function useUpdateCompany() {
  return useApiMutation<{ id: string; input: UpdateCompanyInput }, Company>(
    ({ id, input }) => api.patch<Company>(`/companies/${id}`, input),
    { invalidate: [companyKeys.list(), companyKeys.detail("all")] },
  );
}

export function useDeleteCompany() {
  return useApiMutation<string, void>((id) => api.delete<void>(`/companies/${id}`), {
    invalidate: [companyKeys.list(), contactKeys.list()],
  });
}

export function useContacts(query: ContactListQuery) {
  return useApiQuery<Page<Contact>>(contactKeys.list(query), "/contacts", query);
}

export function useContactFull(id: string | undefined) {
  return useApiQuery<ContactFullView>(contactKeys.full(id ?? "none"), `/contacts/${id}/full`, undefined, {
    enabled: Boolean(id),
  });
}

export function useContactTimeline(id: string, page: number, pageSize = 20) {
  const query = { page, pageSize };
  return useApiQuery<Page<Activity>>(contactKeys.timeline(id, page), `/contacts/${id}/timeline`, query);
}

export function useCreateContact() {
  return useApiMutation<CreateContactInput, Contact>(
    (input) => api.post<Contact>("/contacts", input),
    { invalidate: [contactKeys.list()] },
  );
}

export function useUpdateContact() {
  return useApiMutation<{ id: string; input: UpdateContactInput }, Contact>(
    ({ id, input }) => api.patch<Contact>(`/contacts/${id}`, input),
    { invalidate: [contactKeys.list(), ["contacts"]] },
  );
}

export function useDeleteContact() {
  return useApiMutation<string, void>((id) => api.delete<void>(`/contacts/${id}`), {
    invalidate: [contactKeys.list(), ["contacts"]],
  });
}

export function useSetContactOptOut() {
  return useApiMutation<{ id: string; optedOut: boolean }, Contact>(
    ({ id, optedOut }) => api.patch<Contact>(`/contacts/${id}/opt-out`, { optedOut }),
    { invalidate: [["contacts"], ["conversations"]] },
  );
}

export function useOpportunities(query: OpportunityListQuery) {
  return useApiQuery<Page<Opportunity>>(opportunityKeys.list(query), "/opportunities", query);
}

export function useOpportunity(id: string | undefined) {
  return useApiQuery<Opportunity>(opportunityKeys.detail(id ?? "none"), `/opportunities/${id}`, undefined, {
    enabled: Boolean(id),
  });
}

export function useCreateOpportunity() {
  return useApiMutation<CreateOpportunityInput, Opportunity>(
    (input) => api.post<Opportunity>("/opportunities", input),
    { invalidate: [["opportunities"], ["dashboard"]] },
  );
}

export function useUpdateOpportunity() {
  return useApiMutation<{ id: string; input: UpdateOpportunityInput }, Opportunity>(
    ({ id, input }) => api.patch<Opportunity>(`/opportunities/${id}`, input),
    { invalidate: [["opportunities"], ["contacts"], ["dashboard"]] },
  );
}

export function useDeleteOpportunity() {
  return useApiMutation<string, void>((id) => api.delete<void>(`/opportunities/${id}`), {
    invalidate: [["opportunities"], ["contacts"]],
  });
}

export function useMoveOpportunityStage() {
  return useApiMutation<{ id: string; stageId: string }, Opportunity>(
    ({ id, stageId }) => api.patch<Opportunity>(`/opportunities/${id}/stage`, { stageId }),
    { invalidate: [["opportunities"], ["contacts"], ["dashboard"], ["audit"]] },
  );
}

export function useAddOpportunityNote() {
  return useApiMutation<{ id: string; input: CreateNoteInput }, Activity>(
    ({ id, input }) => api.post<Activity>(`/opportunities/${id}/notes`, input),
    { invalidate: [["opportunities"], ["contacts"]] },
  );
}

export async function downloadOpportunitiesCsv(query: OpportunityListQuery): Promise<void> {
  const { blob, filename } = await apiDownload("/opportunities/export", query);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useSavedLists() {
  return useApiQuery<SavedList[]>(savedListKeys.list, "/saved-lists");
}

export function useCreateSavedList() {
  return useApiMutation<CreateSavedListInput, SavedList>(
    (input) => api.post<SavedList>("/saved-lists", input),
    { invalidate: [savedListKeys.list] },
  );
}
