import type { DIContainerInternal } from "../../container.ts";
import { CaptchaRepository } from "./CaptchaRepository.ts";
import { CaptchaSettingsRepository } from "./CaptchaSettingsRepository.ts";
import { CaptchaJobRunner } from "./jobRunner.ts";
import { CaptchaService } from "./service.ts";

export type { CaptchaService };

type CaptchaServiceFactoryParams = Pick<DIContainerInternal, "valkeyClient" | "api" | "chatId">;

export function captchaServiceFactory({
	valkeyClient,
	api,
	chatId,
}: CaptchaServiceFactoryParams): CaptchaService & Disposable {
	const captchaRepository = new CaptchaRepository({ valkeyClient });
	const captchaSettingsRepository = new CaptchaSettingsRepository({ valkeyClient });
	const captchaService = new CaptchaService({
		chatId,
		api,
		captchaRepository,
		captchaSettingsRepository,
	}) as CaptchaService & Disposable;
	const jobRunner = new CaptchaJobRunner({ chatId, api, captchaService });
	captchaService[Symbol.dispose] = jobRunner[Symbol.dispose];
	return captchaService;
}
