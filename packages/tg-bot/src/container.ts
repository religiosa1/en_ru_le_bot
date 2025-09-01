import { GlideClient } from "@valkey/valkey-glide";
import { asClass, asValue, createContainer, Lifetime } from "awilix";
import type { ViolationCounterRepository, ViolationSettingsRepository } from "./slices/UserViolation/models.ts";
import { UserViolationService } from "./slices/UserViolation/service.ts";
import { ViolationCounterRepositoryValkey } from "./slices/UserViolation/ViolationCounterRepositoryValkey.ts";
import { ViolationSettingsRepositoryValkey } from "./slices/UserViolation/ViolationSettingsRepositoryValkey.ts";

export interface DIContainer {
	valkeyClient: GlideClient;
	violationSettingsRepository: ViolationSettingsRepository;
	violationCounterRepository: ViolationCounterRepository;
	userViolationService: UserViolationService;
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

export async function configureDefaultContainer() {
	const client = await createValkeyClient();
	const container = createContainer<DIContainer>({
		injectionMode: "PROXY",
	});
	container.register({
		valkeyClient: asValue(client),
		violationSettingsRepository: asClass(ViolationSettingsRepositoryValkey, {
			lifetime: Lifetime.SINGLETON,
		}),
		violationCounterRepository: asClass(ViolationCounterRepositoryValkey, {
			lifetime: Lifetime.SINGLETON,
		}),
		userViolationService: asClass(UserViolationService, {
			lifetime: Lifetime.SINGLETON,
		}),
	});
	return container;
}
