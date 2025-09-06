import type { User } from "grammy/types";
import { formatDuration } from "../../utils/duration.ts";
import { type MarkdownString, md, rawMd } from "../../utils/md.ts";

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

export function getCaptchaSuccessMessage(member: User) {
	const mention = makeMdMention(member);
	return md`
		Welcome, ${mention}!
		This chat is made for English and Russian languages practice.

		Monday, Wednesday and Friday — Russian days
		Tuesday, Thursday and Saturday — English days.
		Sunday — free day. 

		* DO NOT WRITE TO OTHER MEMBERS DIRECTLY BEFORE YOU AT LEAST KNOW THEM. *
		Write to the admins if someone is bothering you, so the admins may settle the situation.

		Добро пожаловать, ${mention}!
		Данный чат предназначен для практики английского или русского языков.

		Понедельник, среда, пятница — русский день. 
		Вторник, четверг и суббота — английский. 
		Воскресенье — свободный день.

		* НЕ ПИШИТЕ ДРУГИМ УЧАСТНИКАМ В ЛИЧКУ ПОКА ВЫ С НИМИ ХОТЯ БЫ НЕ ПОЗНАКОМИТЕСЬ. *
		Если вам кто-то докучает, пишите админам, чтобы они могли урегулировать ситуацию.
  `;
}

function makeMdMention(member: User): MarkdownString {
	return rawMd`[@${member.username || member.first_name}](tg://user?id=${member.id})`;
}
