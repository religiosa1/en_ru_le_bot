import { GlideClient } from "@valkey/valkey-glide";
import { type AwilixContainer, asFunction, asValue, createContainer, Lifetime } from "awilix";
import { userViolationServiceFactory } from "./slices/UserViolation/factory.ts";
import type { UserViolationService } from "./slices/UserViolation/service.ts";

/** Internal container with all the deps for modules */
interface DIContainerInternal {
	valkeyClient: GlideClient;
	userViolationService: UserViolationService;
}
/** The exposed part of the container, this is what available in commands */
export type DIContainer = Pick<DIContainerInternal, "userViolationService">;

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

export async function configureDefaultContainer(): Promise<AwilixContainer<DIContainer>> {
	const client = await createValkeyClient();
	const container = createContainer<DIContainerInternal>({
		injectionMode: "PROXY",
	});
	container.register({
		valkeyClient: asValue(client),
		userViolationService: asFunction(userViolationServiceFactory, {
			lifetime: Lifetime.SINGLETON,
		}),
	});
	return container;
}
