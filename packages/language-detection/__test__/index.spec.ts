import test from 'ava'

import { detectAllLanguagesFast, isRussianOrEnglish, loadLanguageModels } from '../index.js'

test.before(() => {
  loadLanguageModels()
})

test('isRussianOrEnglish detects a single English sentence', async (t) => {
  const input = 'Hello, how are you doing today?'
  t.deepEqual(await isRussianOrEnglish(input), [
    { startIndex: 0, endIndex: input.length, wordCount: 6, language: 'en' },
  ])
})

test('isRussianOrEnglish detects a single Russian sentence', async (t) => {
  const input = 'Привет, как у тебя дела сегодня?'
  t.deepEqual(await isRussianOrEnglish(input), [
    { startIndex: 0, endIndex: input.length, wordCount: 6, language: 'ru' },
  ])
})

test('isRussianOrEnglish splits mixed text into per-language segments', async (t) => {
  const input = 'I like borscht. А я люблю пиццу.'
  const result = await isRussianOrEnglish(input)

  t.deepEqual(
    result.map((x) => x.language),
    ['en', 'ru'],
  )
  // indices are in characters, so they must map back onto the JS string
  t.true(input.slice(result[0].startIndex, result[0].endIndex).startsWith('I like borscht'))
  t.true(input.slice(result[1].startIndex, result[1].endIndex).startsWith('А я люблю пиццу'))
})

test('isRussianOrEnglish returns nothing for text without words', async (t) => {
  t.deepEqual(await isRussianOrEnglish(''), [])
  t.deepEqual(await isRussianOrEnglish('12345 !!!'), [])
})

test('detectAllLanguagesFast detects languages other than English and Russian', async (t) => {
  const result = await detectAllLanguagesFast('Guten Tag, wie geht es Ihnen heute?')
  t.is(result?.language, 'de')
  t.true(result!.confidence > 0 && result!.confidence <= 1)
})

test('detectAllLanguagesFast returns null for text without words', async (t) => {
  t.is(await detectAllLanguagesFast(''), null)
  t.is(await detectAllLanguagesFast('12345 !!!'), null)
})
