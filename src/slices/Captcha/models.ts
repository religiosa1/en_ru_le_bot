export interface MemberVerification {
	userId: number;
	userName: string | undefined;
	question: string;
	answer: string;
	msgId: number;
}
