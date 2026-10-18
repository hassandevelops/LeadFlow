import { presetPermissions, type Permission } from "@leadflow/shared";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function daysAgo(days: number): Date {
  return new Date(now - days * DAY);
}

async function main(): Promise<void> {
  await prisma.workspace.deleteMany({ where: { slug: "acme-sales" } });

  const workspace = await prisma.workspace.create({
    data: { name: "Acme Sales Co.", slug: "acme-sales" },
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const people: Array<{
    name: string;
    email: string;
    role: "owner" | "admin" | "user";
    preset: "owner" | "admin" | "manager" | "user";
    status: "available" | "busy" | "on_leave" | "offline";
  }> = [
    { name: "Olivia Grant", email: "olivia@leadflow.dev", role: "owner", preset: "owner", status: "available" },
    { name: "Adam Reyes", email: "adam@leadflow.dev", role: "admin", preset: "admin", status: "available" },
    { name: "Maya Khan", email: "maya@leadflow.dev", role: "user", preset: "manager", status: "available" },
    { name: "Leo Fischer", email: "leo@leadflow.dev", role: "user", preset: "user", status: "busy" },
    { name: "Sofia Marino", email: "sofia@leadflow.dev", role: "user", preset: "user", status: "available" },
    { name: "Noah Bennett", email: "noah@leadflow.dev", role: "user", preset: "user", status: "on_leave" },
    { name: "Emma Cole", email: "emma@leadflow.dev", role: "user", preset: "user", status: "available" },
    { name: "Priya Nair", email: "priya@leadflow.dev", role: "user", preset: "user", status: "offline" },
  ];

  const users = new Map<string, { id: string; name: string }>();
  for (const person of people) {
    const created = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        name: person.name,
        email: person.email,
        passwordHash,
        role: person.role,
        permissions: presetPermissions(person.preset) as Permission[],
        employeeStatus: person.status,
        createdAt: daysAgo(200),
      },
      select: { id: true, name: true },
    });
    users.set(person.email, created);
  }

  const owner = users.get("olivia@leadflow.dev")!;
  const adam = users.get("adam@leadflow.dev")!;
  const maya = users.get("maya@leadflow.dev")!;
  const leo = users.get("leo@leadflow.dev")!;
  const sofia = users.get("sofia@leadflow.dev")!;
  const emma = users.get("emma@leadflow.dev")!;

  await prisma.assignmentRules.create({
    data: {
      workspaceId: workspace.id,
      mode: "round_robin",
      maxOpenLeadsPerUser: 10,
      ackWindowSeconds: 300,
      escalationLevels: [{ afterSeconds: 900, targetUserId: maya.id }],
      backupUserId: adam.id,
      managerUserId: maya.id,
      idleThresholdSeconds: 604800,
      absenceHandling: "reassign_unacknowledged",
    },
  });

  const salesPipeline = await prisma.pipeline.create({
    data: {
      workspaceId: workspace.id,
      name: "Sales Pipeline",
      isDefault: true,
      stages: {
        create: [
          { name: "New Lead", order: 0 },
          { name: "Contacted", order: 1 },
          { name: "Qualified", order: 2, requiredFieldKeys: ["budget"] },
          { name: "Proposal Sent", order: 3, requiredFieldKeys: ["budget", "proposal_link"] },
          { name: "Won", order: 4, isWon: true, color: "emerald" },
          { name: "Lost", order: 5, isLost: true, color: "rose" },
        ],
      },
    },
    include: { stages: true },
  });

  const partnerPipeline = await prisma.pipeline.create({
    data: {
      workspaceId: workspace.id,
      name: "Partnerships",
      stages: {
        create: [
          { name: "Intro", order: 0 },
          { name: "Evaluation", order: 1, requiredFieldKeys: ["priority"] },
          { name: "Won", order: 2, isWon: true },
          { name: "Lost", order: 3, isLost: true },
        ],
      },
    },
    include: { stages: true },
  });

  const stageByName = new Map(salesPipeline.stages.map((stage) => [stage.name, stage.id]));
  const newLeadStage = stageByName.get("New Lead")!;

  const contactFields = [
    {
      key: "industry",
      label: "Industry",
      type: "dropdown" as const,
      options: ["Technology", "Retail", "Finance", "Health", "Education"],
      order: 0,
    },
    { key: "linkedin", label: "LinkedIn", type: "text" as const, options: [], order: 1 },
  ];
  const opportunityFields = [
    { key: "budget", label: "Budget", type: "number" as const, options: [], order: 0 },
    {
      key: "priority",
      label: "Priority",
      type: "dropdown" as const,
      options: ["Low", "Medium", "High"],
      order: 1,
    },
    { key: "decision_maker", label: "Decision maker identified", type: "checkbox" as const, options: [], order: 2 },
    { key: "proposal_link", label: "Proposal link", type: "text" as const, options: [], order: 3 },
  ];

  for (const field of contactFields) {
    await prisma.customFieldDefinition.create({
      data: { workspaceId: workspace.id, entity: "contact", pipelineId: null, ...field, required: false },
    });
  }
  for (const field of opportunityFields) {
    await prisma.customFieldDefinition.create({
      data: { workspaceId: workspace.id, entity: "opportunity", pipelineId: null, ...field, required: false },
    });
  }

  const companySeeds = [
    { name: "Northwind Traders", domain: "northwind.example", phone: "+1 555 0101" },
    { name: "Globex Corporation", domain: "globex.example", phone: "+1 555 0102" },
    { name: "Initech", domain: "initech.example", phone: "+1 555 0103" },
    { name: "Umbrella Health", domain: "umbrella.example", phone: "+1 555 0104" },
    { name: "Stark Retail", domain: "starkretail.example", phone: "+1 555 0105" },
    { name: "Wayne Finance", domain: "waynefin.example", phone: "+1 555 0106" },
  ];
  const companies = [];
  for (const seed of companySeeds) {
    companies.push(
      await prisma.company.create({
        data: { workspaceId: workspace.id, ...seed, address: "1 Market Street", createdAt: daysAgo(120) },
      }),
    );
  }

  const contactSeeds = [
    ["Rachel Adams", "rachel@northwind.example", "+15550111", 0, emma],
    ["Tom Becker", "tom@globex.example", "+15550112", 1, leo],
    ["Nina Castillo", "nina@initech.example", "+15550113", 2, sofia],
    ["Omar Diaz", "omar@umbrella.example", "+15550114", 3, emma],
    ["Grace Evans", "grace@starkretail.example", "+15550115", 4, leo],
    ["Hugo Fontaine", "hugo@waynefin.example", "+15550116", 5, sofia],
    ["Ivy Gardner", "ivy@northwind.example", "+15550117", 0, emma],
    ["Jack Hughes", "jack@globex.example", "+15550118", 1, leo],
    ["Kara Ingram", "kara@initech.example", "+15550119", 2, sofia],
    ["Liam Jones", "liam@umbrella.example", "+15550120", 3, emma],
    ["Mona Klein", "mona@starkretail.example", "+15550121", 4, leo],
    ["Nate Lopez", "nate@waynefin.example", "+15550122", 5, sofia],
  ] as const;

  const contacts = [];
  for (const [name, email, phone, companyIndex, ownerUser] of contactSeeds) {
    contacts.push(
      await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          name,
          email,
          phone,
          companyId: companies[companyIndex]!.id,
          ownerId: ownerUser.id,
          tags: companyIndex % 2 === 0 ? ["vip"] : [],
          customFields: { industry: "Technology" },
          createdAt: daysAgo(90),
        },
      }),
    );
  }

  const stagePlan: Array<{ stage: string; value: number; owner: { id: string; name: string }; acked: boolean }> = [
    { stage: "New Lead", value: 5000, owner: emma, acked: false },
    { stage: "New Lead", value: 7200, owner: leo, acked: false },
    { stage: "New Lead", value: 3100, owner: sofia, acked: false },
    { stage: "Contacted", value: 12000, owner: emma, acked: true },
    { stage: "Contacted", value: 8600, owner: leo, acked: true },
    { stage: "Qualified", value: 24000, owner: sofia, acked: true },
    { stage: "Qualified", value: 15500, owner: emma, acked: true },
    { stage: "Proposal Sent", value: 48000, owner: leo, acked: true },
    { stage: "Proposal Sent", value: 33000, owner: sofia, acked: true },
    { stage: "Won", value: 21000, owner: emma, acked: true },
    { stage: "Won", value: 17500, owner: leo, acked: true },
    { stage: "Lost", value: 9000, owner: sofia, acked: true },
  ];

  for (let index = 0; index < stagePlan.length; index += 1) {
    const plan = stagePlan[index]!;
    const contact = contacts[index % contacts.length]!;
    const stageId = stageByName.get(plan.stage)!;
    const isWon = plan.stage === "Won";
    const isLost = plan.stage === "Lost";
    const assignedAt = daysAgo(30 - index);
    const acknowledgedAt = plan.acked ? new Date(assignedAt.getTime() + 120 * 1000) : null;

    const opportunity = await prisma.opportunity.create({
      data: {
        workspaceId: workspace.id,
        title: `${plan.stage} deal — ${contact.name}`,
        contactId: contact.id,
        companyId: contact.companyId,
        pipelineId: salesPipeline.id,
        stageId,
        value: plan.value,
        currency: "usd",
        ownerId: plan.owner.id,
        source: index % 3 === 0 ? "web_form" : "manual",
        tags: index % 2 === 0 ? ["priority"] : [],
        customFields: { budget: plan.value, priority: index % 3 === 0 ? "High" : "Medium" },
        assignedAt,
        acknowledgedAt,
        lastActionAt: acknowledgedAt ?? assignedAt,
        stageEnteredAt: assignedAt,
        createdAt: assignedAt,
      },
    });

    await prisma.activity.create({
      data: {
        workspaceId: workspace.id,
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "assignment",
        actorId: null,
        actorName: "System",
        summary: `Assigned to ${plan.owner.name}`,
        at: assignedAt,
      },
    });
    if (acknowledgedAt) {
      await prisma.activity.create({
        data: {
          workspaceId: workspace.id,
          entityType: "opportunity",
          entityId: opportunity.id,
          type: "acknowledgement",
          actorId: plan.owner.id,
          actorName: plan.owner.name,
          summary: "Lead acknowledged",
          at: acknowledgedAt,
        },
      });
    }
    if (!isWon && !isLost && acknowledgedAt === null) {
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { ackDeadlineAt: new Date(assignedAt.getTime() + 300 * 1000) },
      });
    }
  }

  const partnershipIntro = partnerPipeline.stages.find((stage) => stage.name === "Intro")!.id;
  await prisma.opportunity.create({
    data: {
      workspaceId: workspace.id,
      title: "Partnership intro — Initech",
      contactId: contacts[2]!.id,
      companyId: companies[2]!.id,
      pipelineId: partnerPipeline.id,
      stageId: partnershipIntro,
      value: 10000,
      ownerId: maya.id,
      source: "manual",
      assignedAt: daysAgo(5),
      createdAt: daysAgo(5),
      stageEnteredAt: daysAgo(5),
    },
  });

  const appointment = await prisma.appointment.create({
    data: {
      workspaceId: workspace.id,
      contactId: contacts[0]!.id,
      userId: emma.id,
      title: "Discovery call — Northwind Traders",
      description: "Intro call to scope the rollout.",
      startsAt: new Date(now + 2 * DAY),
      endsAt: new Date(now + 2 * DAY + 45 * 60 * 1000),
      timeZone: "UTC",
      syncState: "pending",
    },
  });

  await prisma.paymentRequest.create({
    data: {
      workspaceId: workspace.id,
      opportunityId: (await prisma.opportunity.findFirst({
        where: { workspaceId: workspace.id, stage: { isWon: true } },
      }))!.id,
      contactId: contacts[9]!.id,
      amount: 1200,
      currency: "usd",
      status: "pending",
      requestedByUserId: owner.id,
    },
  });

  await prisma.savedList.create({
    data: {
      workspaceId: workspace.id,
      name: "High priority deals",
      entity: "opportunity",
      filter: { tags: ["priority"] },
      createdBy: owner.id,
    },
  });
  await prisma.savedList.create({
    data: {
      workspaceId: workspace.id,
      name: "VIP contacts",
      entity: "contact",
      filter: { tags: ["vip"] },
      createdBy: owner.id,
    },
  });

  console.log(
    `[seed] workspace "Acme Sales Co." ready — 8 users (password: ${DEMO_PASSWORD}), 2 pipelines, 6 custom fields, 12 contacts, 13 opportunities, appointment ${appointment.id}`,
  );
}

main()
  .catch((error) => {
    console.error("[seed] failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
