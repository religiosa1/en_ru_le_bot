import type { DIContainerInternal } from "../../container.ts";
import { LangdaySettingsRepository } from "./repository.ts";
import { LangDayService } from "./service.ts";
import { ShadowStatsRepository } from "./shadowStatsRepository.ts";

export type { LangDayService };

type LangdayServiceFactoryParams = Pick<DIContainerInternal, "valkeyClient">;

export function langDayServiceFactory({ valkeyClient }: LangdayServiceFactoryParams): LangDayService {
	const langdaySettingsRepository = new LangdaySettingsRepository({ valkeyClient });
	const shadowStatsRepository = new ShadowStatsRepository({ valkeyClient });
	return new LangDayService({ langdaySettingsRepository, shadowStatsRepository });
}
