jest.mock("redis", ()=>{
  return require("redis-mock");
});
jest.mock("../components/bot.js");

const LanguageChecker = require("../components/language-checker");

const ENG = "The better part of valor is discretion.";
const RUS = "Мы почитаем всех нулями, А единицами — себя.";
const FOREIGN = "إليه بلغته، فإن الكلام سوف يدخل قلبه";
const PUNCT = "!@#$%^&*()_+\"№;:?*-={}[]<>\\/'`";
const SHRUG = "¯\\_(ツ)_/¯";

test("Valid English", () => {
  expect(LanguageChecker.isEnglishText(ENG)).toBe(true);
});
test("Valid Russian", () => {
  expect(LanguageChecker.isRussianText(RUS)).toBe(true);
});
test("Russian instead of English", () => {
  expect(LanguageChecker.isEnglishText(RUS)).toBe(false);
});
test("English instead of Russian", () => {
  expect(LanguageChecker.isRussianText(ENG)).toBe(false);
});
test("Punctuation omition", ()=> {
  expect(LanguageChecker.isRussianText(RUS + PUNCT)).toBe(true);
  expect(LanguageChecker.isEnglishText(ENG + PUNCT)).toBe(true);
});


test("Foreign language", () => {
  expect(LanguageChecker.isEnglishText(FOREIGN)).toBe(false);
  expect(LanguageChecker.isRussianText(FOREIGN)).toBe(false);
});

test("Invalid Rus/Eng combo", () => {
  expect(LanguageChecker.isRussianText(ENG + ENG + RUS)).toBe(false);
  expect(LanguageChecker.isEnglishText(ENG + RUS + RUS)).toBe(false);
});
test("Valid Rus/Eng combo", () => {
  expect(LanguageChecker.isRussianText(ENG + RUS + RUS)).toBe(true);
  expect(LanguageChecker.isEnglishText(ENG + ENG + RUS)).toBe(true);
});

test("Shrug", ()=> {
  expect(LanguageChecker.isRussianText(SHRUG)).toBe(true);
  expect(LanguageChecker.isEnglishText(SHRUG)).toBe(true);
});
