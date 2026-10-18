import { coreHandlers } from "./core";
import { crmHandlers } from "./crm";
import { insightHandlers } from "./insights";
import { pipelineHandlers } from "./pipeline";
import { workHandlers } from "./work";

export const handlers = [
  ...coreHandlers,
  ...pipelineHandlers,
  ...crmHandlers,
  ...workHandlers,
  ...insightHandlers,
];
