import { CommandGroup } from "../models/CommandGroup.ts";

import { chatAdminCommands } from "./ChatAdmins/commands.ts";
import { cooldownWarningCommands } from "./CooldownWarning/commands.ts";
import { langDayCommands } from "./LangDay/commands.ts";
import { userViolationCommands } from "./UserViolation/commands.ts";

export const allCommands = CommandGroup.merge(
	chatAdminCommands,
	langDayCommands,
	userViolationCommands,
	cooldownWarningCommands,
);
