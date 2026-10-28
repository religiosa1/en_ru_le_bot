import type { DIContainerInternal } from "../../container.ts";
import { UserViolationService } from "./service.ts";
import { ViolationCounterRepositoryValkey } from "./ViolationCounterRepositoryValkey.ts";
import { ViolationSettingsRepositoryValkey } from "./ViolationSettingsRepositoryValkey.ts";

export type { UserViolationService };

type UserViolationServiceFactoryParams = Pick<DIContainerInternal, "valkeyClient">;
export function userViolationServiceFactory({ valkeyClient }: UserViolationServiceFactoryParams): UserViolationService {
	const violationSettingsRepository = new ViolationSettingsRepositoryValkey({ valkeyClient });
	const violationCounterRepository = new ViolationCounterRepositoryValkey({ valkeyClient });
	const service = new UserViolationService({ violationSettingsRepository, violationCounterRepository });
	return service;
}
