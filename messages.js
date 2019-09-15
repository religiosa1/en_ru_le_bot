module.exports = {
  rules: `This chat is made for English and Russian practice.
On Monday, Wednesday and Friday Russian is preferred. On Tuesday, Thursday and Saturday, English is preferred. On Sundays you can speak both languages. It is expected from native speakers to correct other peoples mistakes.

Rudeness, harassement, trolling and antisocial behaviour may lead to a ban. Write to the admins if someone is bothering you, so the admins may settle the situation.

The chat's bot may temporarily mute you for a repeated violations.

IMPORTANT: Language Exchange implies that you can understand most of what is written to you and can answer. You came here to talk, so try to talk.
======================
Данный чат предназначен для практики английского или русского языков.

В понедельник, среду и пятницу желательно говорить по-русски. Во вторник, четверг и субботу -- по-английски. В воскресенье допустимо использование любого из языков. От носителей ожидаются исправления ошибок у других людей.

За грубость, домогательства, троллинг и антисоциальное поведение возможен бан. Если вам кто-то докучает, пишите админам, чтобы админы могли урегулировать ситуацию.

Бот может вас замьютить за повторные нарушения.

ВАЖНО: языковой обмен подразумевает, что вы понимаете большую часть того, что вам пишут и можете отвечать. Вы пришли сюда общаться -- пытайтесь общаться.

======================
DISCORD server r/russian: https://discord.gg/awM49Wb
If you want to have an audiochat with our members, write about it here, choose a chat room and don't forget to tell people there that you came from this chat ;)
  `,

  help: `
/help Print this message.
/rules Print the chat's rules.
/today Print current language day (English, Russian or free).
/cooldown Time left untill next language day violation warning may be printed.
  `,

  help_admin: `
/autolangday Включить/выключить проверку сообщений на язык.
/forcelang [RU | EN | OFF] Принудительно включить русский или английский день. Off чтобы выключить. Без параметра -- статус о принудительном режиме.
/set_cooldown [MINUTES] Выставить время между предупреждениями в минутах. Без параметра -- сбросить таймер.
/flush Обновить информацию об админах.
/mute Включить/выключить функцию мьюта пользователей.
/mute_expiration [N] Задать время, за которое засчитываются повторные нарушения для мьюта. Без параметра -- показать сколько сейчас.
/mute_duration [N] Задать время, на которое выдаётся мьют. Без параметра -- показать сколько сейчас.
/mute_warnings [N] Задать количество предупреждений перед мьютом. Без параметра -- показать сколько сейчас.
/pardon Сбросить накопившиеся нарушения.
  `,

  langday_disabled: "English/Russia days are currently turned off.\nАнглийские/русские дни на данный момент отключены.",
  langday_english: "Today is the English day.\nСегодня день английского языка.",
  langday_russian: "Today is the Russian day.\nСегодня день русского языка.",
  langday_none: "Today is a free day. You can speak any language.\nСегодня вольный день. Вы можете говорить на любом языке.",
  langday_violation_english: "Эй! Сегодня день английского языка! Постарайся говорить по-английски.",
  langday_violation_russian: "Hey! Today is a russian day! Try to speak Russian.",

};
