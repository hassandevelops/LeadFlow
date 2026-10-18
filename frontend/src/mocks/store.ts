import { HttpResponse } from "msw";
import {
  API_ERROR_STATUS,
  presetPermissions,
  SOCKET_EVENTS,
  type Activity,
  type ActivityType,
  type ActorType,
  type Appointment,
  type AssignmentRules,
  type AuditEntry,
  type AuditEventType,
  type Company,
  type Contact,
  type Conversation,
  type CustomFieldDefinition,
  type EmployeeStatus,
  type ErrorCode,
  type IntegrationEvent,
  type IntegrationState,
  type Message,
  type Opportunity,
  type Page,
  type Payment,
  type PaymentRequest,
  type Permission,
  type Pipeline,
  type PublicUser,
  type RecoveryQueueItem,
  type Role,
  type SavedList,
  type SessionUser,
  type Stage,
} from "@leadflow/shared";
import { emitServerEvent } from "./realtime";

const DB_KEY = "lf_mock_db_v1";
const SESSION_KEY = "lf_mock_session";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.now();

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function latency(min = 60, span = 140): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * span));
}

const uid = () => crypto.randomUUID();

export type Db = {
  workspace: { id: string; name: string; slug: string };
  users: PublicUser[];
  googleConnected: Record<string, boolean>;
  pipelines: Pipeline[];
  customFields: CustomFieldDefinition[];
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
  activities: Activity[];
  savedLists: SavedList[];
  conversations: Conversation[];
  messages: Message[];
  paymentRequests: PaymentRequest[];
  payments: Payment[];
  appointments: Appointment[];
  audit: AuditEntry[];
  integrations: IntegrationState[];
  integrationEvents: IntegrationEvent[];
  assignmentRules: AssignmentRules;
  roundRobinCursor: number;
  dashboardPrefs: Record<string, boolean>;
};

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export type Parser<T> = {
  safeParse: (
    value: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } };
};

export type ReadResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export function errorResponse(code: ErrorCode, message: string, details?: unknown): Response {
  return HttpResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: API_ERROR_STATUS[code] },
  );
}

function issueDetails(error: { issues: Array<{ path: Array<string | number>; message: string }> }) {
  return { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
}

export async function readBody<T>(request: Request, schema: Parser<T>): Promise<ReadResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: errorResponse("validation_failed", "Request body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: errorResponse("validation_failed", "Validation failed", issueDetails(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

export function readQuery<T>(request: Request, schema: Parser<T>): ReadResult<T> {
  const url = new URL(request.url);
  const value: Record<string, string> = {};
  url.searchParams.forEach((entry, key) => {
    if (!(key in value)) value[key] = entry;
  });
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, response: errorResponse("validation_failed", "Invalid query", issueDetails(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

export function applySort<T extends Record<string, unknown>>(
  items: T[],
  sort: string | undefined,
  defaultSort: string,
): T[] {
  const spec = sort && sort.trim() !== "" ? sort.trim() : defaultSort;
  const desc = spec.startsWith("-");
  const field = desc ? spec.slice(1) : spec;
  return [...items].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    return desc ? -cmp : cmp;
  });
}

let db: Db | null = null;

export function getDb(): Db {
  db ??= loadDb() ?? seedDb();
  return db;
}

function loadDb(): Db | null {
  const raw = sessionStorage.getItem(DB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Db;
  } catch {
    return null;
  }
}

export function saveDb(): void {
  if (db) sessionStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function replaceDb(next: Db): void {
  db = next;
  saveDb();
}

export function resetDb(): void {
  db = seedDb();
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUserFor(db.users[0]!, db)));
  saveDb();
}

export function setSession(userId: string | null): void {
  if (!userId) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  const user = getDb().users.find((candidate) => candidate.id === userId);
  if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUserFor(user, getDb())));
}

function readSession(): SessionUser | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { email?: unknown };
    if (typeof parsed.email !== "string") return null;
    const user = getDb().users.find((candidate) => candidate.email === parsed.email);
    return user ? sessionUserFor(user, getDb()) : null;
  } catch {
    return null;
  }
}

export function sessionUserFor(user: PublicUser, target: Db): SessionUser {
  return {
    id: user.id,
    workspaceId: target.workspace.id,
    workspaceName: target.workspace.name,
    workspaceSlug: target.workspace.slug,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    employeeStatus: user.employeeStatus,
  };
}

export function currentUser(): PublicUser | null {
  const session = readSession();
  if (!session) return null;
  return getDb().users.find((candidate) => candidate.id === session.id) ?? null;
}

export type GuardResult = { user: PublicUser; response?: undefined } | { user?: undefined; response: Response };

export function requireAuth(permission?: Permission): GuardResult {
  const user = currentUser();
  if (!user) return { response: errorResponse("unauthorized", "Not authenticated") };
  if (permission && !user.permissions.includes(permission)) {
    return { response: errorResponse("forbidden", `Missing permission: ${permission}`) };
  }
  return { user };
}

export function stageById(id: string): Stage | undefined {
  return getDb()
    .pipelines.flatMap((pipeline) => pipeline.stages)
    .find((stage) => stage.id === id);
}

export function contactById(id: string): Contact | undefined {
  return getDb().contacts.find((contact) => contact.id === id);
}

export function userById(id: string): PublicUser | undefined {
  return getDb().users.find((user) => user.id === id);
}

export function companyById(id: string): Company | undefined {
  return getDb().companies.find((company) => company.id === id);
}

export function isOpenOpportunity(opportunity: Opportunity): boolean {
  const stage = stageById(opportunity.stageId);
  return Boolean(stage && !stage.isWon && !stage.isLost);
}

export function openLeadCountFor(userId: string): number {
  return getDb().opportunities.filter(
    (opportunity) => opportunity.ownerId === userId && isOpenOpportunity(opportunity),
  ).length;
}

export function withVisibility(opportunity: Opportunity, viewer: PublicUser): Opportunity {
  if (viewer.permissions.includes("crm.view_value")) return opportunity;
  return { ...opportunity, value: null, valueHidden: true };
}

export function pickAssignee(): string | null {
  const target = getDb();
  const rules = target.assignmentRules;
  const candidates = target.users.filter(
    (user) =>
      user.employeeStatus === "available" &&
      openLeadCountFor(user.id) < rules.maxOpenLeadsPerUser,
  );
  const fallback = target.users.filter((user) => user.employeeStatus !== "offline");
  const pool = candidates.length > 0 ? candidates : fallback;
  if (pool.length === 0) return null;
  target.roundRobinCursor = (target.roundRobinCursor + 1) % pool.length;
  return pool[target.roundRobinCursor]?.id ?? null;
}

export function pushActivity(input: {
  entityType: "contact" | "company" | "opportunity";
  entityId: string;
  type: ActivityType;
  actorId?: string | null;
  actorName?: string;
  summary: string;
  meta?: Record<string, unknown>;
  at?: string;
}): Activity {
  const target = getDb();
  const activity: Activity = {
    id: uid(),
    workspaceId: target.workspace.id,
    entityType: input.entityType,
    entityId: input.entityId,
    type: input.type,
    actorId: input.actorId === undefined ? null : input.actorId,
    actorName: input.actorName ?? "System",
    summary: input.summary,
    meta: input.meta ?? {},
    at: input.at ?? iso(Date.now()),
  };
  target.activities.unshift(activity);
  return activity;
}

export function pushAudit(input: {
  actorId: string | null;
  actorType: ActorType;
  actorName: string;
  eventType: AuditEventType;
  targetType: string;
  targetId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}): AuditEntry {
  const target = getDb();
  const entry: AuditEntry = {
    id: uid(),
    workspaceId: target.workspace.id,
    actorId: input.actorId,
    actorType: input.actorType,
    actorName: input.actorName,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    ...(input.before === undefined ? {} : { before: input.before }),
    ...(input.after === undefined ? {} : { after: input.after }),
    at: iso(Date.now()),
  };
  target.audit.unshift(entry);
  return entry;
}

export function emit(event: string, payload: Record<string, unknown>): void {
  emitServerEvent(event, { workspaceId: getDb().workspace.id, at: iso(Date.now()), ...payload });
}

export function recoveryItems(): RecoveryQueueItem[] {
  const target = getDb();
  const rules = target.assignmentRules;
  const items: RecoveryQueueItem[] = [];

  for (const opportunity of target.opportunities) {
    if (!isOpenOpportunity(opportunity)) continue;
    const owner = opportunity.ownerId ? userById(opportunity.ownerId) : undefined;
    let reason: RecoveryQueueItem["reason"] | null = null;

    if (opportunity.ackDeadlineAt && !opportunity.acknowledgedAt) {
      const overdue = Date.now() > new Date(opportunity.ackDeadlineAt).getTime();
      const exhausted = opportunity.escalationCount >= rules.escalationLevels.length;
      if (overdue && exhausted && opportunity.escalationCount >= 2) reason = "escalated_twice";
      else if (overdue && exhausted) reason = "unacknowledged";
    } else if (opportunity.escalationCount >= 2 && !opportunity.acknowledgedAt) {
      reason = "escalated_twice";
    }

    if (!reason && opportunity.acknowledgedAt) {
      const lastTouch = new Date(
        opportunity.lastActionAt ?? opportunity.assignedAt ?? opportunity.createdAt,
      ).getTime();
      if (Date.now() - lastTouch > rules.idleThresholdSeconds * 1000) reason = "idle";
    }

    if (reason) {
      items.push({
        leadId: opportunity.id,
        title: opportunity.title,
        source: opportunity.source,
        ownerId: opportunity.ownerId,
        ownerName: owner?.name ?? null,
        reason,
        ackDeadlineAt: opportunity.ackDeadlineAt,
        escalationCount: opportunity.escalationCount,
        assignedAt: opportunity.assignedAt,
        lastActionAt: opportunity.lastActionAt,
      });
    }
  }

  return items;
}

export function advanceWorld(): void {
  const target = getDb();
  const rules = target.assignmentRules;
  let changed = false;

  for (const opportunity of target.opportunities) {
    if (!opportunity.ackDeadlineAt || opportunity.acknowledgedAt) continue;
    if (Date.now() <= new Date(opportunity.ackDeadlineAt).getTime()) continue;
    if (!isOpenOpportunity(opportunity)) continue;
    if (opportunity.escalationCount >= rules.escalationLevels.length) continue;

    const level = opportunity.escalationCount + 1;
    const config = rules.escalationLevels[opportunity.escalationCount];
    const newOwnerId = config?.targetUserId ?? rules.backupUserId ?? null;
    const timeout = config?.timeoutSeconds ?? rules.ackWindowSeconds;

    opportunity.ownerId = newOwnerId;
    opportunity.assignedAt = iso(Date.now());
    opportunity.ackDeadlineAt = iso(Date.now() + timeout * 1000);
    opportunity.escalationCount = level;
    opportunity.lastActionAt = iso(Date.now());
    changed = true;

    const newOwner = newOwnerId ? userById(newOwnerId) : undefined;
    const summary = `Lead "${opportunity.title}" escalated to level ${level}${newOwner ? ` — assigned to ${newOwner.name}` : " — no assignee available"}`;
    pushAudit({
      actorId: null,
      actorType: "system",
      actorName: "System",
      eventType: "escalation",
      targetType: "opportunity",
      targetId: opportunity.id,
      summary,
    });
    pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "escalation",
      summary,
    });
    emit(SOCKET_EVENTS.leadEscalated, {
      leadId: opportunity.id,
      newOwnerId,
      reason: "ack_timeout",
      level,
    });
    emit(SOCKET_EVENTS.notificationCreated, {
      notificationId: uid(),
      title: summary,
      link: "/leads",
    });
  }

  if (changed) saveDb();
}

function makeUser(
  id: string,
  name: string,
  email: string,
  role: Role,
  permissions: Permission[],
  employeeStatus: EmployeeStatus,
  joinedAt: number,
): PublicUser {
  return {
    id,
    name,
    email,
    role,
    permissions: [...permissions],
    employeeStatus,
    openLeadCount: 0,
    createdAt: iso(joinedAt),
    updatedAt: iso(joinedAt),
  };
}

function makeStage(
  pipelineId: string,
  name: string,
  order: number,
  extra: Partial<Pick<Stage, "isWon" | "isLost" | "requiredFieldKeys" | "color">> = {},
): Stage {
  return {
    id: uid(),
    pipelineId,
    name,
    order,
    isWon: extra.isWon ?? false,
    isLost: extra.isLost ?? false,
    color: extra.color ?? null,
    requiredFieldKeys: extra.requiredFieldKeys ?? [],
    createdAt: iso(NOW - 120 * DAY),
    updatedAt: iso(NOW - 120 * DAY),
  };
}

function defaultIntegrations(): IntegrationState[] {
  const notConnected = (provider: IntegrationState["provider"], limitsNote: string): IntegrationState => ({
    provider,
    status: "not_connected",
    accountLabel: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    recentErrors: [],
    capabilities: [],
    limitsNote,
    updatedAt: iso(NOW),
  });

  return [
    notConnected(
      "twilio_whatsapp",
      "Uses your Twilio account quota. WhatsApp only allows replies within 24 hours of the customer's last message.",
    ),
    notConnected("stripe", "Stripe processing fees apply per transaction. Payouts follow your Stripe schedule."),
    notConnected("google_calendar", "Per-employee connection. Booking fails for employees who have not connected their calendar."),
    notConnected("resend", "Resend free tier: 100 emails/day and 3,000 emails/month."),
  ];
}

export function defaultRules(ownerId: string): AssignmentRules {
  return {
    mode: "round_robin",
    maxOpenLeadsPerUser: 10,
    ackWindowSeconds: 300,
    escalationLevels: [],
    backupUserId: ownerId,
    managerUserId: ownerId,
    idleThresholdSeconds: 604800,
    absenceHandling: "reassign_unacknowledged",
  };
}

export function freshWorkspaceDb(companyName: string, ownerName: string, ownerEmail: string): Db {
  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace";
  const ownerId = uid();
  const pipelineId = uid();
  const stages = [
    makeStage(pipelineId, "New Lead", 0),
    makeStage(pipelineId, "Qualified", 1),
    makeStage(pipelineId, "Won", 2, { isWon: true }),
    makeStage(pipelineId, "Lost", 3, { isLost: true }),
  ];
  const workspaceId = uid();

  return {
    workspace: { id: workspaceId, name: companyName, slug },
    users: [makeUser(ownerId, ownerName, ownerEmail, "owner", presetPermissions("owner"), "available", NOW)],
    googleConnected: { [ownerId]: false },
    pipelines: [
      {
        id: pipelineId,
        workspaceId,
        name: "Sales Pipeline",
        isDefault: true,
        stages,
        createdAt: iso(NOW),
        updatedAt: iso(NOW),
      },
    ],
    customFields: [],
    companies: [],
    contacts: [],
    opportunities: [],
    activities: [],
    savedLists: [],
    conversations: [],
    messages: [],
    paymentRequests: [],
    payments: [],
    appointments: [],
    audit: [],
    integrations: defaultIntegrations(),
    integrationEvents: [],
    assignmentRules: defaultRules(ownerId),
    roundRobinCursor: 0,
    dashboardPrefs: {
      new_leads_today: true,
      open_pipeline_value: true,
      avg_time_to_first_response: true,
      recovery_queue: true,
      escalations_24h: true,
      employee_availability: true,
      upcoming_appointments: true,
      collected_revenue: true,
    },
  };
}

export function seedDb(): Db {
  const rng = mulberry32(20261018);
  const workspaceId = uid();
  const workspace = { id: workspaceId, name: "Acme Sales Co.", slug: "acme-sales" };

  const users = [
    makeUser(uid(), "Olivia Grant", "olivia@leadflow.dev", "owner", presetPermissions("owner"), "available", NOW - 200 * DAY),
    makeUser(uid(), "Adam Reyes", "adam@leadflow.dev", "admin", presetPermissions("admin"), "available", NOW - 180 * DAY),
    makeUser(uid(), "Maya Khan", "maya@leadflow.dev", "user", presetPermissions("manager"), "available", NOW - 160 * DAY),
    makeUser(uid(), "Leo Fischer", "leo@leadflow.dev", "user", presetPermissions("user"), "busy", NOW - 140 * DAY),
    makeUser(uid(), "Sofia Marino", "sofia@leadflow.dev", "user", presetPermissions("user"), "available", NOW - 120 * DAY),
    makeUser(uid(), "Noah Bennett", "noah@leadflow.dev", "user", presetPermissions("user"), "on_leave", NOW - 100 * DAY),
    makeUser(uid(), "Emma Cole", "emma@leadflow.dev", "user", presetPermissions("user"), "available", NOW - 80 * DAY),
    makeUser(uid(), "Priya Nair", "priya@leadflow.dev", "user", presetPermissions("user"), "offline", NOW - 60 * DAY),
  ];
  const [olivia, adam, maya, leo, sofia, noah, emma, priya] = users as [
    PublicUser, PublicUser, PublicUser, PublicUser, PublicUser, PublicUser, PublicUser, PublicUser,
  ];
  const agents = [maya, leo, sofia, emma, priya];

  const salesPipelineId = uid();
  const salesStages = [
    makeStage(salesPipelineId, "New Lead", 0),
    makeStage(salesPipelineId, "Contacted", 1),
    makeStage(salesPipelineId, "Qualified", 2, { requiredFieldKeys: ["budget"] }),
    makeStage(salesPipelineId, "Proposal Sent", 3, { requiredFieldKeys: ["budget", "proposal_link"] }),
    makeStage(salesPipelineId, "Won", 4, { isWon: true, color: "emerald" }),
    makeStage(salesPipelineId, "Lost", 5, { isLost: true, color: "rose" }),
  ];
  const partnerPipelineId = uid();
  const partnerStages = [
    makeStage(partnerPipelineId, "Intro", 0),
    makeStage(partnerPipelineId, "Evaluation", 1, { requiredFieldKeys: ["priority"] }),
    makeStage(partnerPipelineId, "Won", 2, { isWon: true }),
    makeStage(partnerPipelineId, "Lost", 3, { isLost: true }),
  ];
  const pipelines: Pipeline[] = [
    {
      id: salesPipelineId,
      workspaceId,
      name: "Sales Pipeline",
      isDefault: true,
      stages: salesStages,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
    {
      id: partnerPipelineId,
      workspaceId,
      name: "Partnerships",
      isDefault: false,
      stages: partnerStages,
      createdAt: iso(NOW - 120 * DAY),
      updatedAt: iso(NOW - 120 * DAY),
    },
  ];

  const customFields: CustomFieldDefinition[] = [
    {
      id: uid(),
      workspaceId,
      entity: "contact",
      pipelineId: null,
      key: "industry",
      label: "Industry",
      type: "dropdown",
      options: ["Technology", "Retail", "Finance", "Health", "Education"],
      required: false,
      order: 0,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
    {
      id: uid(),
      workspaceId,
      entity: "contact",
      pipelineId: null,
      key: "linkedin",
      label: "LinkedIn",
      type: "text",
      options: [],
      required: false,
      order: 1,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
    {
      id: uid(),
      workspaceId,
      entity: "opportunity",
      pipelineId: null,
      key: "budget",
      label: "Budget",
      type: "number",
      options: [],
      required: false,
      order: 0,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
    {
      id: uid(),
      workspaceId,
      entity: "opportunity",
      pipelineId: null,
      key: "priority",
      label: "Priority",
      type: "dropdown",
      options: ["Low", "Medium", "High"],
      required: false,
      order: 1,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
    {
      id: uid(),
      workspaceId,
      entity: "opportunity",
      pipelineId: null,
      key: "decision_maker",
      label: "Decision maker identified",
      type: "checkbox",
      options: [],
      required: false,
      order: 2,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
    {
      id: uid(),
      workspaceId,
      entity: "opportunity",
      pipelineId: null,
      key: "proposal_link",
      label: "Proposal link",
      type: "text",
      options: [],
      required: false,
      order: 3,
      createdAt: iso(NOW - 150 * DAY),
      updatedAt: iso(NOW - 150 * DAY),
    },
  ];

  const companyNames = [
    "Northwind Traders",
    "Brightline Media",
    "Vertex Analytics",
    "Cobalt Labs",
    "Harbor & Finch",
    "Summit Logistics",
    "Lumen Health",
    "Pinewood Realty",
    "Atlas Manufacturing",
    "Bluefin Fintech",
    "Orchard Foods",
    "Keystone Security",
  ];
  const domains = [
    "northwind.example",
    "brightline.example",
    "vertex.example",
    "cobalt.example",
    "harborfinch.example",
    "summitlog.example",
    "lumenhealth.example",
    "pinewood.example",
    "atlasmfg.example",
    "bluefin.example",
    "orchardfoods.example",
    "keystone.example",
  ];
  const companies: Company[] = companyNames.map((name, index) => ({
    id: uid(),
    workspaceId,
    name,
    domain: domains[index] ?? null,
    phone: `+1 555 01${String(index).padStart(2, "0")}0`,
    address: `${100 + index * 7} Main St, Springfield`,
    createdAt: iso(NOW - (140 - index * 5) * DAY),
    updatedAt: iso(NOW - (10 + index) * DAY),
  }));

  const firstNames = ["Ava", "Liam", "Mia", "Ethan", "Zoe", "Lucas", "Nora", "Owen", "Ivy", "Kai", "Elena", "Marcus", "Amara", "Felix", "Hana", "Diego", "Lena", "Omar", "Tessa", "Jonas", "Ruby", "Noel", "Freya", "Sami"];
  const lastNames = ["Hart", "Novak", "Silva", "Kaur", "Meyer", "Okafor", "Larsen", "Tanaka", "Moreau", "Alvarez", "Rossi", "Haddad"];
  const tagPool = ["vip", "enterprise", "newsletter", "partner"];
  const industries = ["Technology", "Retail", "Finance", "Health", "Education"];

  const contacts: Contact[] = [];
  for (let index = 0; index < 48; index += 1) {
    const first = pick(rng, firstNames);
    const last = pick(rng, lastNames);
    const company = rng() < 0.8 ? pick(rng, companies) : null;
    const owner = pick(rng, agents);
    const createdAt = NOW - Math.floor(rng() * 80 + 2) * DAY;
    const tags = rng() < 0.35 ? [pick(rng, tagPool)] : [];
    const domain = company?.domain ?? "mail.example";
    contacts.push({
      id: uid(),
      workspaceId,
      name: `${first} ${last}`,
      email: `${first}.${last}${index}`.toLowerCase() + `@${domain}`,
      phone: `+1 555 ${String(1000 + index)} `,
      companyId: company?.id ?? null,
      ownerId: owner.id,
      tags,
      customFields: {
        industry: pick(rng, industries),
        ...(rng() < 0.4 ? { linkedin: `https://linkedin.com/in/${first}${last}`.toLowerCase() } : {}),
      },
      optedOut: index === 7 || index === 20,
      createdAt: iso(createdAt),
      updatedAt: iso(createdAt + Math.floor(rng() * 5) * DAY),
    });
  }

  const services = [
    "Website redesign",
    "CRM migration",
    "SEO retainer",
    "Cloud hosting",
    "Mobile app build",
    "Brand refresh",
    "Data pipeline setup",
    "Support retainer",
    "E-commerce replatform",
    "Analytics setup",
  ];
  const sources = ["web_form", "whatsapp", "manual"] as const;

  type StagePlan = { stage: Stage; count: number };
  const plan: StagePlan[] = [
    { stage: salesStages[0]!, count: 4 },
    { stage: salesStages[1]!, count: 5 },
    { stage: salesStages[2]!, count: 6 },
    { stage: salesStages[3]!, count: 5 },
    { stage: salesStages[4]!, count: 6 },
    { stage: salesStages[5]!, count: 4 },
    { stage: partnerStages[0]!, count: 3 },
    { stage: partnerStages[1]!, count: 3 },
    { stage: partnerStages[2]!, count: 2 },
    { stage: partnerStages[3]!, count: 2 },
  ];

  const opportunities: Opportunity[] = [];
  const activities: Activity[] = [];
  let leadIndex = 0;
  let todayLeads = 0;

  for (const entry of plan) {
    for (let i = 0; i < entry.count; i += 1) {
      const contact = pick(rng, contacts);
      const owner = contact.ownerId ? (userByIdSeed(users, contact.ownerId) ?? pick(rng, agents)) : pick(rng, agents);
      const createdToday = todayLeads < 5 && rng() < 0.5;
      const createdAt = createdToday
        ? NOW - Math.floor(rng() * 6) * HOUR
        : NOW - Math.floor(rng() * 55 + 4) * DAY;
      if (createdToday) todayLeads += 1;
      const stageEnteredAt = createdAt + Math.floor(rng() * 3) * DAY;

      const opportunity: Opportunity = {
        id: uid(),
        workspaceId,
        title: `${pick(rng, services)} — ${contact.name}`,
        contactId: contact.id,
        companyId: contact.companyId,
        pipelineId: entry.stage.pipelineId,
        stageId: entry.stage.id,
        value: 1500 + Math.floor(rng() * 60) * 1000,
        valueHidden: false,
        currency: "usd",
        ownerId: owner.id,
        source: pick(rng, sources),
        tags: rng() < 0.3 ? [pick(rng, tagPool)] : [],
        customFields: {
          priority: pick(rng, ["Low", "Medium", "High"]),
          ...(entry.stage.order >= 2 ? { budget: 2000 + Math.floor(rng() * 50) * 500 } : {}),
          ...(entry.stage.name === "Proposal Sent" ? { proposal_link: "https://docs.example/proposal" } : {}),
          ...(rng() < 0.5 ? { decision_maker: rng() < 0.5 } : {}),
        },
        assignedAt: iso(createdAt + 5 * MIN),
        acknowledgedAt: null,
        ackDeadlineAt: null,
        escalationCount: 0,
        stageEnteredAt: iso(stageEnteredAt),
        lastActionAt: iso(stageEnteredAt),
        createdAt: iso(createdAt),
        updatedAt: iso(stageEnteredAt),
      };

      const needsAck = entry.stage.order <= 1 && entry.stage.pipelineId === salesPipelineId;
      if (needsAck && leadIndex < 6) {
        if (leadIndex < 3) {
          opportunity.assignedAt = iso(NOW - 90 * 1000);
          opportunity.ackDeadlineAt = iso(NOW + (70 + leadIndex * 50) * 1000);
          opportunity.ownerId = leadIndex === 0 ? emma.id : owner.id;
        } else if (leadIndex < 5) {
          opportunity.assignedAt = iso(NOW - 15 * MIN);
          opportunity.ackDeadlineAt = iso(NOW - 5 * MIN);
          opportunity.ownerId = owner.id;
        } else {
          opportunity.assignedAt = iso(NOW - 40 * MIN);
          opportunity.ackDeadlineAt = iso(NOW - 25 * MIN);
          opportunity.escalationCount = 1;
          opportunity.ownerId = maya.id;
        }
        leadIndex += 1;
      } else if (needsAck) {
        const ackAt = createdAt + Math.floor(rng() * 8 + 2) * MIN;
        opportunity.assignedAt = iso(createdAt + MIN);
        opportunity.ackDeadlineAt = iso(createdAt + 5 * MIN);
        opportunity.acknowledgedAt = iso(ackAt);
      }

      if (opportunity.escalationCount >= 2) {
        opportunity.ackDeadlineAt = iso(NOW - 60 * MIN);
        opportunity.acknowledgedAt = null;
      }

      if (entry.stage.isWon || entry.stage.isLost) {
        opportunity.ackDeadlineAt = null;
        opportunity.acknowledgedAt = iso(createdAt + 2 * MIN);
      }

      opportunities.push(opportunity);

      activities.push({
        id: uid(),
        workspaceId,
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "created",
        actorId: owner.id,
        actorName: owner.name,
        summary: `Created opportunity from ${opportunity.source.replace("_", " ")}`,
        meta: {},
        at: iso(createdAt),
      });
      if (needsAck || !entry.stage.isWon) {
        activities.push({
          id: uid(),
          workspaceId,
          entityType: "opportunity",
          entityId: opportunity.id,
          type: "assignment",
          actorId: null,
          actorName: "System",
          summary: `Assigned to ${owner.name} by round-robin`,
          meta: {},
          at: iso(createdAt + 5 * MIN),
        });
      }
      if (opportunity.acknowledgedAt) {
        activities.push({
          id: uid(),
          workspaceId,
          entityType: "opportunity",
          entityId: opportunity.id,
          type: "acknowledgement",
          actorId: opportunity.ownerId,
          actorName: owner.name,
          summary: "Acknowledged the lead",
          meta: {},
          at: opportunity.acknowledgedAt,
        });
      }
      if (stageEnteredAt > createdAt) {
        activities.push({
          id: uid(),
          workspaceId,
          entityType: "opportunity",
          entityId: opportunity.id,
          type: "stage_change",
          actorId: opportunity.ownerId,
          actorName: owner.name,
          summary: `Moved to ${entry.stage.name}`,
          meta: { toStage: entry.stage.name },
          at: iso(stageEnteredAt),
        });
      }
      if (rng() < 0.3) {
        activities.push({
          id: uid(),
          workspaceId,
          entityType: "opportunity",
          entityId: opportunity.id,
          type: "call",
          actorId: opportunity.ownerId,
          actorName: owner.name,
          summary: pick(rng, [
            "Call — discussed pricing",
            "Call — left voicemail",
            "Call — scheduled follow-up next week",
          ]),
          meta: {},
          at: iso(Math.min(NOW - MIN, createdAt + Math.floor(rng() * 10 + 2) * DAY)),
        });
      }
      if (rng() < 0.25) {
        activities.push({
          id: uid(),
          workspaceId,
          entityType: "contact",
          entityId: contact.id,
          type: "note",
          actorId: opportunity.ownerId,
          actorName: owner.name,
          summary: pick(rng, [
            "Note — prefers email over calls",
            "Note — budget approved for next quarter",
            "Note — referred by an existing customer",
            "Note — evaluating two other vendors",
          ]),
          meta: {},
          at: iso(Math.min(NOW - MIN, createdAt + Math.floor(rng() * 20 + 2) * DAY)),
        });
      }
    }
  }

  for (let index = 0; index < 30; index += 1) {
    const contact = contacts[index % contacts.length]!;
    activities.push({
      id: uid(),
      workspaceId,
      entityType: "contact",
      entityId: contact.id,
      type: "created",
      actorId: contact.ownerId,
      actorName: userByIdSeed(users, contact.ownerId ?? "")?.name ?? "System",
      summary: "Contact created",
      meta: {},
      at: contact.createdAt,
    });
  }

  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const inboundBodies = [
    "Hi! Thanks for reaching out. What does pricing look like?",
    "Can we schedule a demo for next week?",
    "We're interested, but need to check with finance first.",
    "Perfect, that works for us.",
    "Could you send over the proposal again?",
    "What's the onboarding timeline usually like?",
  ];
  const outboundBodies = [
    "Hi there! Happy to help — I'll send over pricing options today.",
    "Absolutely. Does Tuesday or Wednesday afternoon work?",
    "Totally understood. I can prepare a short summary for your finance team.",
    "Great news! I'll get the paperwork started.",
    "Re-sent just now — let me know if it comes through.",
    "Typical onboarding takes about two weeks.",
  ];

  for (let index = 0; index < 10; index += 1) {
    const contact = contacts[index * 3]!;
    const conversationId = uid();
    const base = NOW - Math.floor(rng() * 5 + 1) * DAY;
    let lastAt = base;
    const count = 4 + Math.floor(rng() * 4);
    for (let m = 0; m < count; m += 1) {
      const inbound = m % 2 === 0;
      lastAt = base + m * Math.floor(rng() * 90 + 30) * MIN;
      messages.push({
        id: uid(),
        workspaceId,
        conversationId,
        direction: inbound ? "inbound" : "outbound",
        body: inbound ? pick(rng, inboundBodies) : pick(rng, outboundBodies),
        status: inbound ? "received" : pick(rng, ["delivered", "sent", "delivered"]),
        providerMessageId: inbound ? null : `SM${uid().slice(0, 20)}`,
        errorCode: null,
        errorMessage: null,
        createdAt: iso(lastAt),
        updatedAt: iso(lastAt),
      });
    }
    const failedMessage = messages[messages.length - 1]!;
    if (index === 2) {
      failedMessage.status = "failed";
      failedMessage.errorCode = "twilio_30006";
      failedMessage.errorMessage = "Landline or unreachable carrier";
    }
    conversations.push({
      id: conversationId,
      workspaceId,
      contactId: contact.id,
      channel: "whatsapp",
      assignedUserId: contact.ownerId,
      lastMessageAt: iso(lastAt),
      unreadCount: index % 3,
      createdAt: iso(base),
      updatedAt: iso(lastAt),
    });
  }

  const paymentRequests: PaymentRequest[] = [];
  const payments: Payment[] = [];
  const payOpps = opportunities.filter((opportunity) => opportunity.value !== null).slice(0, 8);
  const requestStatuses = ["paid", "paid", "paid", "pending", "pending", "expired", "failed", "paid"] as const;
  payOpps.forEach((opportunity, index) => {
    const status = requestStatuses[index] ?? "pending";
    const amount = opportunity.value ?? 1000;
    const createdAt = NOW - Math.floor(rng() * 20 + 1) * DAY;
    const request: PaymentRequest = {
      id: uid(),
      workspaceId,
      opportunityId: opportunity.id,
      contactId: opportunity.contactId,
      amount,
      currency: "usd",
      status,
      provider: "stripe",
      providerRef: status === "pending" ? null : `plink_${uid().slice(0, 12)}`,
      checkoutUrl:
        status === "pending" ? `https://checkout.stripe.com/c/pay/${uid().slice(0, 16)}` : null,
      requestedByUserId: opportunity.ownerId ?? olivia.id,
      createdAt: iso(createdAt),
      updatedAt: iso(createdAt + HOUR),
    };
    paymentRequests.push(request);

    if (status === "paid") {
      const paidAt = createdAt + Math.floor(rng() * 3 + 1) * HOUR;
      const paymentStatus = index === 0 ? "refunded" : index === 7 ? "partially_refunded" : "succeeded";
      payments.push({
        id: uid(),
        workspaceId,
        paymentRequestId: request.id,
        amount,
        currency: "usd",
        status: paymentStatus,
        providerRef: `pi_${uid().slice(0, 16)}`,
        paidAt: iso(paidAt),
        refundedAmount:
          paymentStatus === "refunded" ? amount : paymentStatus === "partially_refunded" ? amount / 2 : 0,
        createdAt: iso(paidAt),
        updatedAt: iso(paidAt + HOUR),
      });
    }
  });

  const appointments: Appointment[] = [];
  const syncStates = ["synced", "synced", "synced", "synced", "synced", "pending", "failed", "synced", "synced", "needs_reconnect"] as const;
  for (let index = 0; index < 10; index += 1) {
    const contact = pick(rng, contacts);
    const user = pick(rng, users);
    const dayOffset = Math.floor(rng() * 12) + 1;
    const start = new Date(NOW + dayOffset * DAY);
    start.setHours(9 + Math.floor(rng() * 7), rng() < 0.5 ? 0 : 30, 0, 0);
    const end = new Date(start.getTime() + 45 * MIN);
    const syncState = syncStates[index]!;
    appointments.push({
      id: uid(),
      workspaceId,
      contactId: contact.id,
      opportunityId: null,
      userId: user.id,
      title: `Discovery call — ${contact.name}`,
      description: index % 3 === 0 ? "Intro call to scope the project." : null,
      startsAt: iso(start.getTime()),
      endsAt: iso(end.getTime()),
      timeZone: "UTC",
      status: index === 8 ? "cancelled" : "scheduled",
      syncState,
      googleEventId: syncState === "synced" ? `gcal_${uid().slice(0, 10)}` : null,
      syncError: syncState === "failed" ? "Google token expired" : null,
      createdAt: iso(NOW - Math.floor(rng() * 10 + 1) * DAY),
      updatedAt: iso(NOW - Math.floor(rng() * 2) * DAY),
    });
  }

  const eventTypes: AuditEventType[] = [
    "assignment",
    "acknowledgement",
    "escalation",
    "reassignment",
    "role_change",
    "permission_change",
    "config_change",
    "integration_change",
    "deletion",
  ];
  const audit: AuditEntry[] = [];
  for (let index = 0; index < 140; index += 1) {
    const at = NOW - Math.floor(rng() * 30 * DAY);
    const eventType = pick(rng, eventTypes);
    const actor = rng() < 0.25 ? null : pick(rng, users);
    const opportunity = pick(rng, opportunities);
    const contact = pick(rng, contacts);
    const subjectUser = pick(rng, users);
    const isUserEvent = eventType === "role_change" || eventType === "permission_change";
    const summaries: Record<AuditEventType, string> = {
      assignment: `Lead "${opportunity.title}" assigned to ${pick(rng, users).name}`,
      acknowledgement: `Lead "${opportunity.title}" acknowledged`,
      escalation: `Lead "${opportunity.title}" escalated without acknowledgement`,
      reassignment: `Lead "${opportunity.title}" reassigned`,
      role_change: `Role changed for ${subjectUser.name}`,
      permission_change: `Permissions updated for ${subjectUser.name}`,
      config_change: "Assignment rules updated",
      integration_change: `Integration ${pick(rng, ["twilio_whatsapp", "stripe", "google_calendar", "resend"])} settings changed`,
      deletion: `Contact "${contact.name}" deleted`,
    };
    audit.push({
      id: uid(),
      workspaceId,
      actorId: actor?.id ?? null,
      actorType: actor ? "user" : "system",
      actorName: actor?.name ?? "System",
      eventType,
      targetType: isUserEvent ? "user" : "opportunity",
      targetId: isUserEvent ? subjectUser.id : opportunity.id,
      summary: summaries[eventType],
      ...(eventType === "role_change"
        ? { before: { role: "user" }, after: { role: "admin" } }
        : {}),
      ...(eventType === "config_change"
        ? { before: { ackWindowSeconds: 600 }, after: { ackWindowSeconds: 300 } }
        : {}),
      at: iso(at),
    });
  }
  audit.sort((a, b) => b.at.localeCompare(a.at));

  const integrationEvents: IntegrationEvent[] = [];
  const providers = ["twilio_whatsapp", "stripe", "google_calendar", "resend"] as const;
  const providerEvents: Record<(typeof providers)[number], [string, string][]> = {
    twilio_whatsapp: [
      ["message.inbound", "Inbound WhatsApp message"],
      ["message.status", "Delivery receipt"],
      ["message.outbound", "Outbound message"],
    ],
    stripe: [
      ["checkout.session.completed", "Checkout completed"],
      ["payment_intent.succeeded", "Payment succeeded"],
      ["charge.refunded", "Charge refunded"],
    ],
    google_calendar: [
      ["event.create", "Event created"],
      ["event.update", "Event updated"],
      ["token.refresh", "Token refreshed"],
    ],
    resend: [
      ["email.sent", "Email sent"],
      ["email.delivered", "Email delivered"],
      ["email.bounced", "Email bounced"],
    ],
  };
  for (let index = 0; index < 45; index += 1) {
    const provider = providers[index % providers.length]!;
    const [eventType, label] = pick(rng, providerEvents[provider]);
    const result = rng() < 0.82 ? "success" : rng() < 0.6 ? "rejected" : "failure";
    const at = NOW - Math.floor(rng() * 14 * DAY);
    integrationEvents.push({
      id: uid(),
      workspaceId,
      provider,
      direction: rng() < 0.5 ? "inbound" : "outbound",
      eventType,
      reference: `${label} (#${1000 + index})`,
      result,
      errorMessage:
        result === "failure"
          ? pick(rng, [
              "Rate limit exceeded (429)",
              "Recipient bounced (hard)",
              "Upstream timeout after 10s",
            ])
          : result === "rejected"
            ? pick(rng, ["Signature verification failed", "Duplicate event ignored"])
            : null,
      createdAt: iso(at),
    });
  }
  integrationEvents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const integrations: IntegrationState[] = [
    {
      provider: "twilio_whatsapp",
      status: "connected",
      accountLabel: "+1 555 010 2233",
      lastSuccessAt: iso(NOW - 2 * HOUR),
      lastErrorAt: iso(NOW - 2 * DAY),
      recentErrors: [{ at: iso(NOW - 2 * DAY), message: "WhatsApp session window closed — message not sent" }],
      capabilities: ["Send & receive WhatsApp messages", "Delivery receipts", "Opt-out handling"],
      limitsNote:
        "Uses your Twilio account quota. WhatsApp only allows replies within 24 hours of the customer's last message.",
      updatedAt: iso(NOW - 30 * DAY),
    },
    {
      provider: "stripe",
      status: "connected",
      accountLabel: "acct_1Nx7Acme",
      lastSuccessAt: iso(NOW - 40 * MIN),
      lastErrorAt: null,
      recentErrors: [],
      capabilities: ["Payment links", "Webhook status updates", "Refunds"],
      limitsNote: "Stripe processing fees apply per transaction. Payouts follow your Stripe schedule.",
      updatedAt: iso(NOW - 45 * DAY),
    },
    {
      provider: "google_calendar",
      status: "connected",
      accountLabel: "ops@acme.example",
      lastSuccessAt: iso(NOW - 20 * MIN),
      lastErrorAt: iso(NOW - 3 * DAY),
      recentErrors: [{ at: iso(NOW - 3 * DAY), message: "Token refresh failed — reconnect required for one user" }],
      capabilities: ["Two-way event sync", "Free/busy lookup"],
      limitsNote:
        "Per-employee connection. Booking fails for employees who have not connected their calendar.",
      updatedAt: iso(NOW - 60 * DAY),
    },
    {
      provider: "resend",
      status: "connected",
      accountLabel: "notifications@acme.example",
      lastSuccessAt: iso(NOW - 4 * HOUR),
      lastErrorAt: iso(NOW - 3 * HOUR),
      recentErrors: [
        { at: iso(NOW - 3 * HOUR), message: "Rate limit exceeded (429) — daily quota reached" },
        { at: iso(NOW - 26 * HOUR), message: "Recipient bounced (hard)" },
      ],
      capabilities: ["Transactional email alerts", "Delivery status"],
      limitsNote: "Resend free tier: 100 emails/day and 3,000 emails/month.",
      updatedAt: iso(NOW - 20 * DAY),
    },
  ];

  const savedLists: SavedList[] = [
    {
      id: uid(),
      workspaceId,
      name: "High priority deals",
      entity: "opportunity",
      filter: { "cf.priority": "High" },
      createdBy: maya.id,
      createdAt: iso(NOW - 10 * DAY),
      updatedAt: iso(NOW - 10 * DAY),
    },
    {
      id: uid(),
      workspaceId,
      name: "VIP contacts",
      entity: "contact",
      filter: { tag: "vip" },
      createdBy: olivia.id,
      createdAt: iso(NOW - 8 * DAY),
      updatedAt: iso(NOW - 8 * DAY),
    },
  ];

  const googleConnected: Record<string, boolean> = {};
  for (const user of users) googleConnected[user.id] = true;
  googleConnected[leo.id] = false;
  googleConnected[emma.id] = false;

  return {
    workspace,
    users,
    googleConnected,
    pipelines,
    customFields,
    companies,
    contacts,
    opportunities,
    activities,
    savedLists,
    conversations,
    messages,
    paymentRequests,
    payments,
    appointments,
    audit,
    integrations,
    integrationEvents,
    assignmentRules: {
      mode: "round_robin",
      maxOpenLeadsPerUser: 10,
      ackWindowSeconds: 300,
      escalationLevels: [{ targetUserId: adam.id, timeoutSeconds: 300 }],
      backupUserId: adam.id,
      managerUserId: olivia.id,
      idleThresholdSeconds: 604800,
      absenceHandling: "reassign_unacknowledged",
    },
    roundRobinCursor: 0,
    dashboardPrefs: {
      new_leads_today: true,
      open_pipeline_value: true,
      avg_time_to_first_response: true,
      recovery_queue: true,
      escalations_24h: true,
      employee_availability: true,
      upcoming_appointments: true,
      collected_revenue: true,
    },
  };
}

function userByIdSeed(users: PublicUser[], id: string): PublicUser | undefined {
  return users.find((user) => user.id === id);
}
