// Overriding this package (it comes from grammy), which tries to bring AbortController
// definitions, but makes that in an way incompatible with the default node type defs in the project
declare module "abort-controller" {
	export interface AbortSignal extends globalThis.AbortSignal {}
	export interface AbortController extends globalThis.AbortController {}

	export const AbortSignal: {
		new (): AbortSignal;
		readonly prototype: AbortSignal;
		// biome-ignore lint/suspicious/noExplicitAny: that's the correct type from globalThis
		abort(reason?: any): AbortSignal;
		timeout(milliseconds: number): AbortSignal;
	};

	export const AbortController: {
		new (): AbortController;
		readonly prototype: AbortController;
	};
}
