export function makeQuestionAnswer(): [question: string, answer: string] {
	const a = Math.floor(Math.random() * 10) + 1;
	const b = Math.floor(Math.random() * 10) + 1;
	const question = `${a} + ${b}`;
	const answer = (a + b).toString();
	return [question, answer];
}
