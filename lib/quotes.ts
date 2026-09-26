import type { Lang } from "./i18n/dictionaries";

/** One quote per day, the same for the whole team; cycles through the list. */
const QUOTES: { bg: string; en: string; author?: string }[] = [
  { bg: "Всяка сделка започва с едно обаждане. Направи го сега.", en: "Every deal starts with one call. Make it now." },
  { bg: "Клиентите не купуват имоти. Купуват доверие.", en: "Clients don't buy properties. They buy trust." },
  { bg: "Дисциплината днес е комисионата утре.", en: "Discipline today is commission tomorrow." },
  { bg: "Най-добрият момент за обаждане беше вчера. Вторият най-добър е сега.", en: "The best time to call was yesterday. The second best is now." },
  { bg: "Не чакай пазара. Създай го.", en: "Don't wait for the market. Create it." },
  { bg: "Един оглед повече днес е една сделка по-близо.", en: "One more viewing today is one deal closer." },
  { bg: "Професионалистът прави и това, което не му се иска.", en: "A professional also does what they don't feel like doing." },
  { bg: "Слушай повече, отколкото говориш. Клиентът ще ти каже как да му продадеш.", en: "Listen more than you talk. The client will tell you how to sell to them." },
  { bg: "Всяко „не“ те доближава до следващото „да“.", en: "Every “no” brings you closer to the next “yes”." },
  { bg: "Успехът е сбор от малки задачи, свършени всеки ден.", en: "Success is small tasks, done every day." },
  { bg: "Бъди брокерът, на когото клиентите звънят първи.", en: "Be the broker clients call first." },
  { bg: "Имотът се продава от човек, не от обява.", en: "People sell properties, listings don't." },
  { bg: "Обещай малко, изпълни повече.", en: "Promise less, deliver more." },
  { bg: "Днешната енергия е утрешната репутация.", en: "Today's energy is tomorrow's reputation." },
  { bg: "Не губи клиент заради неотговорено обаждане.", en: "Never lose a client to an unanswered call." },
  { bg: "Познавай квартала по-добре от всеки друг.", en: "Know the neighbourhood better than anyone." },
  { bg: "Всеки ден имаш шанс да промениш нечий дом.", en: "Every day you get to change someone's home." },
  { bg: "Настойчивостта побеждава таланта, който не работи.", en: "Persistence beats talent that doesn't work." },
  { bg: "Първо свърши най-трудната задача. Останалото е лесно.", en: "Do the hardest task first. The rest is easy." },
  { bg: "Добрият брокер намира имот. Великият намира решение.", en: "A good broker finds a property. A great one finds a solution." },
  { bg: "Скоростта на отговора е половината сделка.", en: "Speed of response is half the deal." },
  { bg: "Всеки клиент е препоръка, която чака да се случи.", en: "Every client is a referral waiting to happen." },
  { bg: "Не продавай квадратни метри. Продавай живот.", en: "Don't sell square metres. Sell a life." },
  { bg: "Целта без план е само желание.", en: "A goal without a plan is just a wish." },
  { bg: "Отметни задачите. Събери комисионите.", en: "Tick off the tasks. Collect the commissions." },
  { bg: "Най-скъпото нещо в имотите е загубеното време.", en: "The most expensive thing in real estate is lost time." },
  { bg: "Честността е най-добрият маркетинг.", en: "Honesty is the best marketing." },
  { bg: "Шампионите се правят в дните, в които никой не гледа.", en: "Champions are made on the days no one is watching." },
  { bg: "Обади се на клиента, преди той да се обади на друг брокер.", en: "Call the client before they call another broker." },
  { bg: "Единственият начин да вършиш страхотна работа е да обичаш това, което правиш.", en: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { bg: "Малките крачки всеки ден правят големите години.", en: "Small steps every day make big years." },
];

/** Days since 1970 in Sofia, so the quote changes at local midnight. */
function dayNumber(date: Date) {
  const local = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Sofia" }));
  return Math.floor(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / 86_400_000);
}

export function quoteOfTheDay(lang: Lang, date = new Date()) {
  const quote = QUOTES[dayNumber(date) % QUOTES.length];
  return { text: quote[lang], author: quote.author ?? null };
}
