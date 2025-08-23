import * as langDetection from "@en-ru-le/language-detection";

const message = "Половина текста тут на русском, and half's in english";

const init = performance.now();
console.log("isRussianOrEnglish", langDetection.isRussianOrEnglish(message));
const ts2 = performance.now();
console.log("Detected in ", ts2 - init);
console.log(
	"detectAllLanguagesFast",
	langDetection.detectAllLanguagesFast(message),
);
console.log("Detected in ", performance.now() - ts2);
