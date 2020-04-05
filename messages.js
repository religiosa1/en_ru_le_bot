module.exports = {
  rules: `This chat is made for English and Russian practice.
  On Monday and Friday Russian is spoken. On Wednesday and Sunday English is spoken. The rest of the days you can speak any of these two languages. It is expected from native speakers to correct other people's mistakes.

  The day is changed at 00:00 CET (Berlin).

  Rudeness, trolling, harassment, harassment in DM, antisocial behaviour and so on may lead to a ban. It's not a court room, but a community. It is possible to get a ban just because we don't like you -- be polite. Write to the admins if someone is bothering you, so the admins may settle the situation.
  Cursing is not forbidden, but that doesn't mean you need to use it constantly.

  The chat bot may temporarily mute you for repeated violations of the Russian/English day rules.

  IMPORTANT: Language Exchange implies that you can understand most of what is written to you and can answer. You came here to talk, so try to talk.
  ======================
  Данный чат предназначен для практики английского или русского языков.

  В понедельник и пятницу желательно говорить по-русски. В среду и воскресенье -- по-английски. В остальные дни допустимо использование любого из этих языков. От носителей ожидаются исправления ошибок у других людей.

  Смена дня происходит в 00:00 Центральноевропейского времени (Берлин).

  За грубость, троллинг, домогательства, домогания в личке, антисоциальное поведение и т.д. возможен бан. У нас не зал суда, а сообщество. Бан возможен просто за то что вы не понравились -- будьте вежливы. Если вам кто-то докучает, пишите админам, чтобы админы могли урегулировать ситуацию.
  Использование мата не запрещено, но это не значит что нужно использовать его постоянно.

  Бот может вас замьютить за повторные нарушения порядка Русских/Английских дней.

  ВАЖНО: языковой обмен подразумевает, что вы понимаете большую часть того, что вам пишут и можете отвечать. Вы пришли сюда общаться -- пытайтесь общаться.

  ======================
  If you don't understand if today is an English or Russian day write /today
  Or take a look at this picture.

  https://i.ibb.co/TPHLyTP/days.png

  =====================

  Unwanted advertisement and self-promotion may lead to a permanent ban. Please ask the members if they are interested in what you're selling first.

  ======================
  Out DISCORD server: https://discord.gg/CZazt9P
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
/threshold [FLOAT] Выставить допустимую долю "неправильных" символов в сообщении. 0 -- используется только параметр badchars. Без параметра -- показать текущую.
/badchars [N] Выставить допустимое количество "неправильных" символов в сообщении. Без параметра -- показать текущее.
/flush Обновить информацию об админах.
/mute Включить/выключить функцию мьюта пользователей.
/mute_expiration [N] Задать время, за которое засчитываются повторные нарушения для мьюта. Без параметра -- показать сколько сейчас.
/mute_duration [N] Задать время, на которое выдаётся мьют. Без параметра -- показать сколько сейчас.
/mute_warnings [N] Задать количество предупреждений перед мьютом. Без параметра -- показать сколько сейчас.
/pardon Сбросить накопившиеся нарушения.
  `,

  langday_english: "Today is an English day.\nСегодня день английского языка.",
  langday_russian: "Today is a Russian day.\nСегодня день русского языка.",
  langday_none: "Today is a free day. You can speak any language.\nСегодня свободный день. Вы можете говорить на любом языке.",
  langday_disabled: "English/Russian checks with bots are currently turned off.\nПроверка английских/русских дней ботом на данный момент отключена.",
  langday_forcedEn: "Usage of English was forced by admins.\nИспользование английского было закреплено админами.",
  langday_forcedRu: "Usage of Russian was forced by admins.\nИспользование русского было закреплено админами.",
  langday_violation_english: "Эй! Сегодня день английского языка! Постарайся говорить по-английски.",
  langday_violation_russian: "Hey! Today is a russian day! Try to speak Russian.",
};
