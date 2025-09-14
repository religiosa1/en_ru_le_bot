import type { BotContext } from "../../BotContext.ts";
import { Time } from "../../enums/Time.ts";
import { getNewUserFromChatMemberEvent } from "../../middlewares/userJoinedTargetChat.ts";
import { formatDuration } from "../../utils/duration.ts";
import { raise } from "../../utils/raise.ts";

const PROBATION_DURATION = 1 * Time.Days;

export async function onChatMemberProbationHandler(ctx: BotContext) {
	const logger = ctx.getLogger("probation::new_chat_member_handler");
	const user =
		getNewUserFromChatMemberEvent(ctx) ?? raise("user must be present in the event fo r probation handler to work");

	logger.info(
		{ user },
		`Restricting user for ${formatDuration(PROBATION_DURATION)}, so they only can send text messages`,
	);
	await ctx.restrictChatMember(
		user.id,
		{
			can_send_messages: true,
			can_send_audios: false,
			can_send_documents: false,
			can_send_photos: false,
			can_send_videos: false,
			can_send_video_notes: false,
			can_send_voice_notes: false,
			can_send_polls: false,
			/** True, if the user is allowed to send animations, games, stickers and use inline bots */
			can_send_other_messages: false,
			can_add_web_page_previews: false,
			can_change_info: false,
			can_invite_users: true,
			can_pin_messages: false,
			can_manage_topics: false,
		},
		{
			until_date: (Date.now() + PROBATION_DURATION) / Time.Seconds,
		},
	);
}
