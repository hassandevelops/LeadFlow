export const authKeys = {
  me: ["auth", "me"] as const,
};

export const userKeys = {
  list: (query?: unknown) => ["users", "list", query ?? null] as const,
  availability: ["users", "availability"] as const,
};

export const pipelineKeys = {
  list: ["pipelines", "list"] as const,
};

export const customFieldKeys = {
  list: (entity?: string) => ["custom-fields", entity ?? "all"] as const,
};

export const contactKeys = {
  list: (query?: unknown) => ["contacts", "list", query ?? null] as const,
  full: (id: string) => ["contacts", id, "full"] as const,
  timeline: (id: string, page: number) => ["contacts", id, "timeline", page] as const,
};

export const companyKeys = {
  list: (query?: unknown) => ["companies", "list", query ?? null] as const,
  detail: (id: string) => ["companies", id] as const,
};

export const opportunityKeys = {
  list: (query?: unknown) => ["opportunities", "list", query ?? null] as const,
  detail: (id: string) => ["opportunities", id] as const,
};

export const savedListKeys = {
  list: ["saved-lists"] as const,
};

export const leadKeys = {
  inbox: (query?: unknown) => ["leads", "inbox", query ?? null] as const,
  recovery: (query?: unknown) => ["leads", "recovery", query ?? null] as const,
  rules: ["assignment-rules"] as const,
};

export const conversationKeys = {
  list: (query?: unknown) => ["conversations", "list", query ?? null] as const,
  messages: (id: string, page: number) => ["conversations", id, "messages", page] as const,
  allMessages: (id: string) => ["conversations", id, "messages"] as const,
};

export const paymentKeys = {
  requests: (query?: unknown) => ["payment-requests", query ?? null] as const,
  payments: (query?: unknown) => ["payments", query ?? null] as const,
};

export const appointmentKeys = {
  list: (query?: unknown) => ["appointments", "list", query ?? null] as const,
  busy: (userId: string, from: string, to: string) =>
    ["appointments", "busy", userId, from, to] as const,
};

export const auditKeys = {
  list: (query?: unknown) => ["audit", "list", query ?? null] as const,
};

export const dashboardKeys = {
  metrics: (query?: unknown) => ["dashboard", "metrics", query ?? null] as const,
  preferences: ["dashboard", "preferences"] as const,
};

export const integrationKeys = {
  list: ["integrations", "list"] as const,
  events: (provider: string, page: number) => ["integrations", provider, "events", page] as const,
};
