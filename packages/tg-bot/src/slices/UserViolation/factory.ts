import type { GlideClient } from "@valkey/valkey-glide";
import { UserViolationService } from "./service.ts";
import { ViolationCounterRepositoryValkey } from "./ViolationCounterRepositoryValkey.ts";
import { ViolationSettingsRepositoryValkey } from "./ViolationSettingsRepositoryValkey.ts";

export function userViolationServiceFactory({ valkeyClient }: { valkeyClient: GlideClient }): UserViolationService {
	const violationSettingsRepository = new ViolationSettingsRepositoryValkey({ valkeyClient });
	const violationCounterRepository = new ViolationCounterRepositoryValkey({ valkeyClient });
	const service = new UserViolationService({ violationSettingsRepository, violationCounterRepository });
	return service;
}
