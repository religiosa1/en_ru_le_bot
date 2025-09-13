import type { User } from "grammy/types";
import { assertNever } from "./assertNever.ts";

export function isUser(obj: unknown): obj is User {
	if (!obj || typeof obj !== "object") return false;
	if (!("id" in obj) || typeof obj.id !== "number") return false;
	if (!("is_bot" in obj) || typeof obj.is_bot !== "boolean") return false;
	if (!("first_name" in obj) || typeof obj.first_name !== "string") return false;
	return true;
}

/** Formats user mention -- if user is a User object, than uses first_name, otherwise, considers user to be a user mention. */
export function formatUser(user: User | string): string {
	if (typeof user === "string") return user;
	if (isUser(user)) return user.first_name || user.id.toString();
	assertNever(user, "unexpected value type for user object");
}
