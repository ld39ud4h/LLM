import { askCommand } from "./ask.js";
import { rememberCommand } from "./remember.js";
import { memoriesCommand } from "./memories.js";
import { forgetCommand } from "./forget.js";
import { personaCommand } from "./persona.js";
import { setupLanstecCommand } from "./setup-lanstec.js";
import { webhookTestCommand } from "./webhook-test.js";\nimport { listaCommand } from "./lista.js";

export const commands = [
  askCommand,
  rememberCommand,
  memoriesCommand,
  forgetCommand,
  personaCommand,
  setupLanstecCommand,
  webhookTestCommand,\n  listaCommand,
];
