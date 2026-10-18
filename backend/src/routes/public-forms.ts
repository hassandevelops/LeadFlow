import { webFormLeadSchema } from "@leadflow/shared";
import { Router } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseBody } from "../lib/validation";
import { publicFormRateLimit } from "../middleware/rate-limit";
import { intakeLeadFromInput } from "../services/lead-intake";

export const publicFormsRouter = Router();

publicFormsRouter.post(
  "/public/forms/:workspaceSlug/leads",
  publicFormRateLimit,
  async (req, res) => {
    const slug = String(req.params.workspaceSlug ?? "");
    const input = parseBody(webFormLeadSchema, req);

    if (!input.email && !input.phone) {
      throw ApiError.validationFailed("A lead needs at least an email or a phone number", [
        { path: "email", message: "Provide an email or a phone number" },
      ]);
    }

    const workspace = await prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) {
      throw ApiError.notFound("This form does not exist");
    }

    await intakeLeadFromInput({
      workspaceId: workspace.id,
      actor: null,
      input: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        title: input.name,
        source: "web_form",
        note: input.message,
      },
    });

    res.status(201).json({ status: "received" });
  },
);
