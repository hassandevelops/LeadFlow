import { HttpResponse, delay, http } from "msw";
import {
  inviteUserSchema,
  loginSchema,
  paginationQuerySchema,
  presetPermissions,
  signupSchema,
  updateEmployeeStatusSchema,
  updateUserPermissionsSchema,
  updateUserRoleSchema,
} from "@leadflow/shared";
import { env } from "../../lib/env";
import { DEMO_PASSWORD } from "../demo";
import {
  currentUser,
  errorResponse,
  freshWorkspaceDb,
  getDb,
  latency,
  openLeadCountFor,
  paginate,
  pushAudit,
  readBody,
  readQuery,
  replaceDb,
  requireAuth,
  saveDb,
  sessionUserFor,
  setSession,
} from "../store";

function serializeUser(id: string) {
  const user = getDb().users.find((candidate) => candidate.id === id);
  if (!user) return null;
  return { ...user, openLeadCount: openLeadCountFor(user.id) };
}

export const coreHandlers = [
  http.get(`${env.apiUrl}/auth/me`, async () => {
    await latency();
    const user = currentUser();
    return user ? HttpResponse.json(sessionUserFor(user, getDb())) : errorResponse("unauthorized", "Not authenticated");
  }),

  http.post(`${env.apiUrl}/auth/login`, async ({ request }) => {
    const body = await readBody(request, loginSchema);
    if (!body.ok) return body.response;
    await delay(280);
    const user = getDb().users.find((candidate) => candidate.email === body.data.email);
    if (!user || body.data.password !== DEMO_PASSWORD) {
      return errorResponse("unauthorized", "Invalid email or password");
    }
    setSession(user.id);
    return HttpResponse.json(sessionUserFor(user, getDb()));
  }),

  http.post(`${env.apiUrl}/auth/signup`, async ({ request }) => {
    const body = await readBody(request, signupSchema);
    if (!body.ok) return body.response;
    await delay(320);
    const existing = getDb().users.find((candidate) => candidate.email === body.data.email);
    if (existing && getDb().users.length > 1) {
      return errorResponse("conflict", "An account with this email already exists");
    }
    const fresh = freshWorkspaceDb(body.data.companyName, body.data.name, body.data.email);
    replaceDb(fresh);
    const owner = fresh.users[0]!;
    setSession(owner.id);
    return HttpResponse.json(sessionUserFor(owner, fresh));
  }),

  http.post(`${env.apiUrl}/auth/logout`, async () => {
    await delay(120);
    setSession(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.apiUrl}/time`, () => HttpResponse.json({ serverTime: new Date().toISOString() })),

  http.get(`${env.apiUrl}/users`, async ({ request }) => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    if (!auth.user.permissions.includes("users.manage") && !auth.user.permissions.includes("leads.view")) {
      return errorResponse("forbidden", "Missing permission: users.manage");
    }
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const users = [...getDb().users]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => ({ ...user, openLeadCount: openLeadCountFor(user.id) }));
    return HttpResponse.json(paginate(users, query.data.page, query.data.pageSize));
  }),

  http.post(`${env.apiUrl}/users/invite`, async ({ request }) => {
    const auth = requireAuth("users.manage");
    if (auth.response) return auth.response;
    const body = await readBody(request, inviteUserSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    if (db.users.some((candidate) => candidate.email === body.data.email)) {
      return errorResponse("conflict", "A user with this email already exists");
    }
    if (auth.user.role === "admin" && body.data.role === "owner") {
      return errorResponse("forbidden", "Admins cannot create another Owner");
    }
    const user = {
      id: crypto.randomUUID(),
      name: body.data.name,
      email: body.data.email,
      role: body.data.role,
      permissions: body.data.permissions ?? presetPermissions(body.data.role),
      employeeStatus: "offline" as const,
      openLeadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.users.push(user);
    db.googleConnected[user.id] = false;
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "role_change",
      targetType: "user",
      targetId: user.id,
      summary: `Invited ${user.name} as ${user.role}`,
      after: { role: user.role, permissions: user.permissions },
    });
    saveDb();
    return HttpResponse.json(user);
  }),

  http.patch(`${env.apiUrl}/users/:id/role`, async ({ request, params }) => {
    const auth = requireAuth("users.manage");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateUserRoleSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const target = db.users.find((candidate) => candidate.id === params.id);
    if (!target) return errorResponse("not_found", "User not found");
    if (auth.user.role === "admin" && (target.role === "owner" || body.data.role === "owner")) {
      return errorResponse("forbidden", "Admins cannot modify the Owner role");
    }
    if (auth.user.id === target.id) {
      return errorResponse("conflict", "You cannot change your own role");
    }
    const before = { role: target.role };
    target.role = body.data.role;
    target.permissions = body.data.permissions ?? presetPermissions(body.data.role);
    target.updatedAt = new Date().toISOString();
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "role_change",
      targetType: "user",
      targetId: target.id,
      summary: `Role changed for ${target.name}: ${before.role} → ${target.role}`,
      before,
      after: { role: target.role },
    });
    saveDb();
    return HttpResponse.json(serializeUser(target.id));
  }),

  http.patch(`${env.apiUrl}/users/:id/permissions`, async ({ request, params }) => {
    const auth = requireAuth("users.manage");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateUserPermissionsSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const target = db.users.find((candidate) => candidate.id === params.id);
    if (!target) return errorResponse("not_found", "User not found");
    if (auth.user.role === "admin" && target.role === "owner") {
      return errorResponse("forbidden", "Admins cannot modify the Owner");
    }
    const before = { permissions: [...target.permissions] };
    target.permissions = body.data.permissions;
    target.updatedAt = new Date().toISOString();
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "permission_change",
      targetType: "user",
      targetId: target.id,
      summary: `Permissions updated for ${target.name}`,
      before,
      after: { permissions: target.permissions },
    });
    saveDb();
    return HttpResponse.json(serializeUser(target.id));
  }),

  http.patch(`${env.apiUrl}/users/me/status`, async ({ request }) => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    const body = await readBody(request, updateEmployeeStatusSchema);
    if (!body.ok) return body.response;
    await delay(120);
    const user = getDb().users.find((candidate) => candidate.id === auth.user.id)!;
    user.employeeStatus = body.data.status;
    user.updatedAt = new Date().toISOString();
    saveDb();
    return HttpResponse.json(serializeUser(user.id));
  }),

  http.get(`${env.apiUrl}/availability`, async () => {
    const auth = requireAuth("leads.view");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const maxOpenLeads = db.assignmentRules.maxOpenLeadsPerUser;
    const availability = db.users.map((user) => {
      const openLeadCount = openLeadCountFor(user.id);
      return {
        userId: user.id,
        name: user.name,
        status: user.employeeStatus,
        openLeadCount,
        maxOpenLeads,
        isAvailable: user.employeeStatus === "available" && openLeadCount < maxOpenLeads,
      };
    });
    return HttpResponse.json(availability);
  }),
];
