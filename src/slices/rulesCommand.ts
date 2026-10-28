import { dedent as d } from "ts-dedent";
import { CommandGroup } from "../models/CommandGroup.ts";

export const rulesCommand = new CommandGroup().addCommand("rules", "display the group's rules", async (ctx) => {
	ctx.reply(d`
    This chat is made for English and Russian practice.
  On Monday, Wednesday and Friday Russian is spoken. On Tuesday, Thursday and Saturday English is spoken. On Sunday you can speak any of these two languages. It is expected from native speakers to correct other people's mistakes.

  The day is changed at 00:00 CET (Berlin).

  DO NOT WRITE TO OTHER MEMBERS DIRECTLY BEFORE YOU AT LEAST KNOW THEM. Better don't write them at all until you're pretty confident you're not bugging them. This is highly discouraged and will be punished.

  Rudeness, trolling, harassment, harassment in DM, antisocial behaviour and so on may lead to a ban. It's not a court room, but a community. It is possible to get a ban just because we don't like you -- be polite. Write to the admins if someone is bothering you, so the admins may settle the situation.
  Cursing is not forbidden, but that doesn't mean you need to use it constantly.

  The chat bot may temporarily mute you for repeated violations of the Russian/English day rules.

  IMPORTANT: Language Exchange implies that you can understand most of what is written to you and can answer. You came here to talk, so try to talk.
  ======================
  Данный чат предназначен для практики английского или русского языков.

  В понедельник, среду и пятницу говорим по-русски. Во вторник, четверг и субботу -- по-английски. В воскресенье допустимо использование любого из этих языков. От носителей ожидаются исправления ошибок у других людей.

  Смена дня происходит в 00:00 Центральноевропейского времени (Берлин).

  НЕ ПИШИТЕ ДРУГИМ УЧАСТНИКАМ В ЛИЧКУ ПОКА ВЫ С НИМИ ХОТЯ БЫ НЕ ПОЗНАКОМИТЕСЬ. Лучше вообще им не пишите, пока вы не достаточно уверены, что вы им не докучаете. Такое поведение крайне неодобряется и будет караться.

  За грубость, троллинг, домогательства, домогания в личке, антисоциальное поведение и т.д. возможен бан. У нас не зал суда, а сообщество. Бан возможен просто за то что вы не понравились -- будьте вежливы. Если вам кто-то докучает, пишите админам, чтобы админы могли урегулировать ситуацию.
  Использование мата не запрещено, но это не значит что нужно использовать его постоянно.

  Бот может вас замьютить за повторные нарушения порядка Русских/Английских дней.

  ВАЖНО: языковой обмен подразумевает, что вы понимаете большую часть того, что вам пишут и можете отвечать. Вы пришли сюда общаться -- пытайтесь общаться.

  ======================
  If you don't understand if today is an English or Russian day write /today
  Or take a look at this picture.

  https://i.ibb.co/kK6tYNG/days-all.png

  =====================

  Unwanted advertisement and self-promotion may lead to a permanent ban. Please ask the members if they are interested in what you're selling first.`);
});
