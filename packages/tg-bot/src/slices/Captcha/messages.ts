import type { User } from "grammy/types";
import { formatDuration } from "../../utils/duration.ts";
import { makeMdMention, md } from "../../utils/md.ts";

export function getCaptchaMessage(question: string, member: User, timeToSolve: number): string {
	const mention = makeMdMention(member);

	const dur = formatDuration(timeToSolve);
	return md`
    ${question}

    ${mention}, please, send the solution to the arithmetic operation provided.
    If you won't do it in ${dur}, we'll consider you a bot. Thank you!

    ${mention}, пожалуйста, напиши сумму чисел в примере.
    Если ты не сделаешь этого в течение ${dur}, мы сочтём тебя ботом. Спасибо!
  `;
}
