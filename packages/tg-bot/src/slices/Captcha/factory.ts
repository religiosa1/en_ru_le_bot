import type { DIContainerInternal } from "../../container.ts";
import { CaptchaRepository } from "./CaptchaRepository.ts";
import { CaptchaSettingsRepository } from "./CaptchaSettingsRepository.ts";
import { CaptchaService } from "./service.ts";

export type { CaptchaService };

type CaptchaServiceFactoryParams = Pick<DIContainerInternal, "valkeyClient" | "api" | "chatId">;

export function captchaServiceFactory({ valkeyClient, api, chatId }: CaptchaServiceFactoryParams): CaptchaService {
	const captchaRepository = new CaptchaRepository({ valkeyClient });
	const captchaSettingsRepository = new CaptchaSettingsRepository({ valkeyClient });
	return new CaptchaService({ chatId, api, captchaRepository, captchaSettingsRepository });
}
