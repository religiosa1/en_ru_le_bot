import type { DIContainerInternal } from "../../container.ts";
import { CooldownSettingsRepository } from "./repository.ts";
import { CooldownService } from "./service.ts";

export type { CooldownService };

type CooldownServiceFactoryParams = Pick<DIContainerInternal, "valkeyClient">;

export function cooldownServiceFactory({ valkeyClient }: CooldownServiceFactoryParams): CooldownService {
	const cooldownSettingsRepository = new CooldownSettingsRepository({ valkeyClient });
	return new CooldownService({ cooldownSettingsRepository });
}
