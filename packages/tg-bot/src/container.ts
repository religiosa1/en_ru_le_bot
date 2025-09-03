import { GlideClient } from "@valkey/valkey-glide";
import { type AwilixContainer, asClass, asFunction, asValue, createContainer, Lifetime } from "awilix";
import type { Api } from "grammy";
import { AlarmService } from "./slices/Alarm/service.ts";
import { ChatAdminRepo } from "./slices/ChatAdmins/service.ts";
import { type CooldownService, cooldownServiceFactory } from "./slices/Cooldown/factory.ts";
import { LangDayService } from "./slices/LangDay/service.ts";
import { type UserViolationService, userViolationServiceFactory } from "./slices/UserViolation/factory.ts";

/** The exposed part of the container, this is what available in ctx*/
export interface DIContainer {
	chatId: number;
	chatAdminRepo: ChatAdminRepo;
	cooldownService: CooldownService;
	langDayService: LangDayService;
	userViolationService: UserViolationService;
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
		chatId: asValue(chatId),
		api: asValue(api),
		valkeyClient: asValue(client),
		chatAdminRepo: asClass(ChatAdminRepo, {
			lifetime: Lifetime.SCOPED,
		}),
		langDayService: asClass(LangDayService, {
			lifetime: Lifetime.SCOPED,
		}),
		userViolationService: asFunction(userViolationServiceFactory, {
			lifetime: Lifetime.SCOPED,
		}),
		cooldownService: asFunction(cooldownServiceFactory, {
			lifetime: Lifetime.SCOPED,
		}),
		alarmService: asClass(AlarmService, {
			lifetime: Lifetime.SINGLETON,
			dispose: (v) => v[Symbol.dispose](),
		}),
	});

	// Eager initialization for alarm service, so it arms its cron jobs
	container.resolve("alarmService");

	return container;
}
