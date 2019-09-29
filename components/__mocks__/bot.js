"use strict";

const bot = {
  get TOKEN() { return "TESTTOKEN"; },
  bot: {
    sendMessage: jest.fn(),
  },
};

module.exports = bot;
