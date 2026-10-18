import { createCompanySchema, paginationQuerySchema, updateCompanySchema } from "@leadflow/shared";
import { Router } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseSort } from "../lib/query";
import { toCompany } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const companiesRouter = Router();

const SORT_FIELDS = ["name", "createdAt", "updatedAt"] as const;

async function findCompany(workspaceId: string, id: string) {
  const company = await prisma.company.findFirst({ where: { id, workspaceId } });
  if (!company) {
    throw ApiError.notFound("Company not found");
  }
  return company;
}

companiesRouter.get("/companies", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(paginationQuerySchema, req);
  const orderBy = parseSort(query.sort, SORT_FIELDS, "name");

  const where = {
    workspaceId,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.company.count({ where }),
  ]);

  res.json({
    data: rows.map(toCompany),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
});

companiesRouter.post("/companies", requirePermission("crm.create"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(createCompanySchema, req);

  const company = await prisma.company.create({
    data: {
      workspaceId,
      name: input.name,
      domain: input.domain ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
    },
  });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "company",
    targetId: company.id,
    summary: `Company “${company.name}” created`,
  });

  res.status(201).json(toCompany(company));
});

companiesRouter.get("/companies/:id", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const company = await findCompany(workspaceId, parseIdParam(req));
  res.json(toCompany(company));
});

companiesRouter.patch("/companies/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const company = await findCompany(workspaceId, parseIdParam(req));
  const input = parseBody(updateCompanySchema, req);

  const updated = await prisma.company.update({
    where: { id: company.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.domain === undefined ? {} : { domain: input.domain }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.address === undefined ? {} : { address: input.address }),
    },
  });

  res.json(toCompany(updated));
});

companiesRouter.delete("/companies/:id", requirePermission("crm.delete"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const company = await findCompany(workspaceId, parseIdParam(req));

  await prisma.company.delete({ where: { id: company.id } });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "deletion",
    targetType: "company",
    targetId: company.id,
    summary: `Company “${company.name}” deleted`,
    before: { name: company.name, domain: company.domain, phone: company.phone },
  });

  res.status(204).end();
});
