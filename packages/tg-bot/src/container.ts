import { GlideClient } from "@valkey/valkey-glide";
import { type AwilixContainer, asClass, asFunction, asValue, createContainer, Lifetime } from "awilix";
import type { Api } from "grammy";
import { AlarmService } from "./slices/Alarm/service.ts";
import { type CaptchaService, captchaServiceFactory } from "./slices/Captcha/factory.ts";
import { ChatAdminRepo } from "./slices/ChatAdmins/service.ts";
import { type CooldownService, cooldownServiceFactory } from "./slices/Cooldown/factory.ts";
import { langDayServiceFactory, type LangDayService } from "./slices/LangDay/factory.ts";
import { type UserViolationService, userViolationServiceFactory } from "./slices/UserViolation/factory.ts";
import { WelcomeService } from "./slices/WelcomeMessage/service.ts";

/** The exposed part of the container, this is what available in ctx*/
export interface DIContainer {
	chatId: number;
	chatAdminRepo: ChatAdminRepo;
	langDayService: LangDayService;
	cooldownService: CooldownService;
	userViolationService: UserViolationService;
	welcomeService: WelcomeService;
	captchaService: CaptchaService;
	alarmService: AlarmService;
}

/** Internal container with all the deps for modules */
export interface DIContainerInternal extends DIContainer {
	api: Api;
	valkeyClient: GlideClient;
}

const createValkeyClient = async (): Promise<GlideClient> => {
	const addresses = [
		{
			host: process.env.VALKEY_HOST || "localhost",
			port: +(process.env.VALKEY_PORT ?? 0) || 6379,
		},
	];

	return await GlideClient.createClient({
		addresses: addresses,
		clientName: "enrule_valkey_client",
	});
};

export async function configureDefaultContainer(api: Api, chatId: number): Promise<AwilixContainer<DIContainer>> {
	const client = await createValkeyClient();
	const container = createContainer<DIContainerInternal>({
		injectionMode: "PROXY",
	});
	container.register({
		api: asValue(api),
		valkeyClient: asValue(client),
		chatId: asValue(chatId),
		chatAdminRepo: asClass(ChatAdminRepo, {
			lifetime: Lifetime.SCOPED,
		}),
		langDayService: asFunction(langDayServiceFactory, {
			lifetime: Lifetime.SCOPED,
		}),
		cooldownService: asFunction(cooldownServiceFactory, {
			lifetime: Lifetime.SCOPED,
		}),
		userViolationService: asFunction(userViolationServiceFactory, {
			lifetime: Lifetime.SCOPED,
		}),
		welcomeService: asClass(WelcomeService, {
			lifetime: Lifetime.SCOPED,
		}),
		captchaService: asFunction(captchaServiceFactory, {
			lifetime: Lifetime.SINGLETON,
			dispose: (v) => v[Symbol.dispose](),
		}),
		alarmService: asClass(AlarmService, {
			lifetime: Lifetime.SINGLETON,
			dispose: (v) => v[Symbol.dispose](),
		}),
	});

	// Eager initialization for service that need to arm their internals
	container.resolve("alarmService");
	container.resolve("captchaService");

	return container;
}
