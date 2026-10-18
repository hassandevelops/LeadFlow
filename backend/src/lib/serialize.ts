import type {
  Activity,
  Appointment,
  AuditEntry,
  Company,
  Contact,
  Conversation,
  CustomFieldDefinition,
  IntegrationEvent,
  IntegrationState,
  Message,
  Opportunity,
  Payment,
  PaymentRequest,
  Pipeline,
  PublicUser,
  RecoveryQueueItem,
  SavedList,
  SessionUser,
  Stage,
} from "@leadflow/shared";
import type {
  Activity as ActivityRow,
  Appointment as AppointmentRow,
  AuditEntry as AuditEntryRow,
  Company as CompanyRow,
  Contact as ContactRow,
  Conversation as ConversationRow,
  CustomFieldDefinition as CustomFieldRow,
  Integration as IntegrationRow,
  Message as MessageRow,
  Opportunity as OpportunityRow,
  Payment as PaymentRow,
  PaymentRequest as PaymentRequestRow,
  Pipeline as PipelineRow,
  ProviderEvent as ProviderEventRow,
  SavedList as SavedListRow,
  Stage as StageRow,
  User,
  Workspace,
} from "@prisma/client";
import type { Permission } from "@leadflow/shared";

export function userPermissions(user: Pick<User, "permissions">): Permission[] {
  return Array.isArray(user.permissions) ? (user.permissions as Permission[]) : [];
}

export function toSessionUser(user: User, workspace: Workspace): SessionUser {
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: userPermissions(user),
    employeeStatus: user.employeeStatus,
  };
}

export function toPublicUser(user: User, openLeadCount: number): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: userPermissions(user),
    employeeStatus: user.employeeStatus,
    openLeadCount,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toCompany(company: CompanyRow): Company {
  return {
    id: company.id,
    workspaceId: company.workspaceId,
    name: company.name,
    domain: company.domain,
    phone: company.phone,
    address: company.address,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export function toContact(contact: ContactRow): Contact {
  return {
    id: contact.id,
    workspaceId: contact.workspaceId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    companyId: contact.companyId,
    ownerId: contact.ownerId,
    tags: (contact.tags as string[]) ?? [],
    customFields: (contact.customFields as Record<string, unknown>) ?? {},
    optedOut: contact.optedOut,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export function toOpportunity(row: OpportunityRow, canViewValue: boolean): Opportunity {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    contactId: row.contactId,
    companyId: row.companyId,
    pipelineId: row.pipelineId,
    stageId: row.stageId,
    value: canViewValue && row.value !== null ? Number(row.value) : null,
    valueHidden: !canViewValue,
    currency: row.currency,
    ownerId: row.ownerId,
    source: row.source,
    tags: (row.tags as string[]) ?? [],
    customFields: (row.customFields as Record<string, unknown>) ?? {},
    assignedAt: row.assignedAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    ackDeadlineAt: row.ackDeadlineAt?.toISOString() ?? null,
    escalationCount: row.escalationCount,
    stageEnteredAt: row.stageEnteredAt?.toISOString() ?? null,
    lastActionAt: row.lastActionAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    entityType: row.entityType,
    entityId: row.entityId,
    type: row.type,
    actorId: row.actorId,
    actorName: row.actorName,
    summary: row.summary,
    meta: (row.meta as Record<string, unknown>) ?? {},
    at: row.at.toISOString(),
  };
}

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    contactId: row.contactId,
    channel: row.channel,
    assignedUserId: row.assignedUserId,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    unreadCount: row.unreadCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    direction: row.direction,
    body: row.body,
    status: row.status,
    providerMessageId: row.providerMessageId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPaymentRequest(row: PaymentRequestRow): PaymentRequest {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    opportunityId: row.opportunityId,
    contactId: row.contactId,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    provider: "stripe",
    providerRef: row.providerRef,
    checkoutUrl: row.checkoutUrl,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    paymentRequestId: row.paymentRequestId,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    providerRef: row.providerRef,
    paidAt: row.paidAt?.toISOString() ?? null,
    refundedAmount: Number(row.refundedAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    contactId: row.contactId,
    opportunityId: row.opportunityId,
    userId: row.userId,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: row.timeZone,
    status: row.status,
    syncState: row.syncState,
    googleEventId: row.googleEventId,
    syncError: row.syncError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStage(row: StageRow): Stage {
  return {
    id: row.id,
    pipelineId: row.pipelineId,
    name: row.name,
    order: row.order,
    isWon: row.isWon,
    isLost: row.isLost,
    color: row.color,
    requiredFieldKeys: (row.requiredFieldKeys as string[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPipeline(row: PipelineRow & { stages: StageRow[] }): Pipeline {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    isDefault: row.isDefault,
    stages: [...row.stages].sort((a, b) => a.order - b.order).map(toStage),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCustomField(row: CustomFieldRow): CustomFieldDefinition {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    entity: row.entity,
    pipelineId: row.pipelineId,
    key: row.key,
    label: row.label,
    type: row.type,
    options: (row.options as string[]) ?? [],
    required: row.required,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSavedList(row: SavedListRow): SavedList {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    entity: row.entity,
    filter: (row.filter as Record<string, unknown>) ?? {},
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAuditEntry(row: AuditEntryRow): AuditEntry {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    actorType: row.actorType,
    actorName: row.actorName,
    eventType: row.eventType,
    targetType: row.targetType,
    targetId: row.targetId,
    summary: row.summary,
    ...(row.before === null ? {} : { before: row.before }),
    ...(row.after === null ? {} : { after: row.after }),
    at: row.at.toISOString(),
  };
}

export function toIntegrationEvent(row: ProviderEventRow): IntegrationEvent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    direction: row.direction,
    eventType: row.eventType,
    reference: row.externalId,
    result: row.result as IntegrationEvent["result"],
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toIntegrationState(input: {
  provider: IntegrationState["provider"];
  status: IntegrationState["status"];
  accountLabel: string | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  recentErrors: IntegrationState["recentErrors"];
  capabilities: string[];
  limitsNote: string;
  updatedAt: Date;
}): IntegrationState {
  return {
    provider: input.provider,
    status: input.status,
    accountLabel: input.accountLabel,
    lastSuccessAt: input.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: input.lastErrorAt?.toISOString() ?? null,
    recentErrors: input.recentErrors,
    capabilities: input.capabilities,
    limitsNote: input.limitsNote,
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function toRecoveryQueueItem(input: {
  lead: OpportunityRow;
  ownerName: string | null;
  reason: RecoveryQueueItem["reason"];
}): RecoveryQueueItem {
  return {
    leadId: input.lead.id,
    title: input.lead.title,
    source: input.lead.source,
    ownerId: input.lead.ownerId,
    ownerName: input.ownerName,
    reason: input.reason,
    ackDeadlineAt: input.lead.ackDeadlineAt?.toISOString() ?? null,
    escalationCount: input.lead.escalationCount,
    assignedAt: input.lead.assignedAt?.toISOString() ?? null,
    lastActionAt: input.lead.lastActionAt?.toISOString() ?? null,
  };
}

export function toIntegrationRowSummary(row: IntegrationRow) {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    accountLabel: row.accountLabel,
    userId: row.userId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
