import { CommandGroup } from "../models/CommandGroup.ts";

import { chatAdminCommands } from "./ChatAdmins/commands.ts";
import { cooldownCommands } from "./Cooldown/commands.ts";
import { langDayCommands } from "./LangDay/commands.ts";

export const allCommands = CommandGroup.merge(chatAdminCommands, langDayCommands, cooldownCommands);
