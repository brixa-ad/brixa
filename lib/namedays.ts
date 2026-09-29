/**
 * Bulgarian name days: the names that celebrate on a day. Fixed feasts by date; the movable ones
 * (Todorovden, Lazarovden, Tsvetnitsa, Spasovden) from the Orthodox Easter.
 */
import { addDays } from "./dates";
import { orthodoxEaster } from "./workdays";

const FIXED: Record<string, { feast: string; names: string[] }> = {
  "01-01": { feast: "Васильовден", names: ["Васил", "Василка", "Василена"] },
  "01-06": { feast: "Йордановден", names: ["Йордан", "Йорданка", "Данчо", "Богдан", "Богдана", "Божидар", "Божидара"] },
  "01-07": { feast: "Ивановден", names: ["Иван", "Иванка", "Ивана", "Иво", "Ивайло", "Ваня", "Йоан", "Йоана", "Жана", "Жан"] },
  "01-17": { feast: "Антоновден", names: ["Антон", "Антония", "Андон", "Тони"] },
  "01-18": { feast: "Атанасовден", names: ["Атанас", "Атанаска", "Наско"] },
  "02-01": { feast: "Трифоновден", names: ["Трифон"] },
  "02-10": { feast: "Харалампиевден", names: ["Харалампи"] },
  "03-25": { feast: "Благовещение", names: ["Благовест", "Благовеста", "Блага", "Благой", "Евангелина"] },
  "05-05": { feast: "Св. Ирина", names: ["Ирина"] },
  "05-06": { feast: "Гергьовден", names: ["Георги", "Гергана", "Жоро", "Гошо", "Жоржета"] },
  "05-11": { feast: "Св. Св. Кирил и Методий", names: ["Кирил", "Методий"] },
  "05-21": { feast: "Св. Св. Константин и Елена", names: ["Константин", "Костадин", "Костадинка", "Елена", "Еленко"] },
  "06-24": { feast: "Еньовден", names: ["Еньо", "Енчо"] },
  "06-29": { feast: "Петровден", names: ["Петър", "Петра", "Петя", "Павел", "Павлина"] },
  "07-17": { feast: "Св. Марина", names: ["Марина"] },
  "07-20": { feast: "Илинден", names: ["Илия", "Илиян", "Илияна", "Илко"] },
  "08-15": { feast: "Успение Богородично", names: ["Мария", "Мариана", "Марияна", "Мариан", "Марио", "Мара", "Мариела"] },
  "08-26": { feast: "Св. Наталия", names: ["Наталия", "Натали"] },
  "08-30": { feast: "Александровден", names: ["Александър", "Александра", "Сашо", "Саша"] },
  "09-01": { feast: "Симеоновден", names: ["Симеон", "Симона", "Симеона"] },
  "09-14": { feast: "Кръстовден", names: ["Кръстьо", "Кръстю", "Кръстина", "Кръстан"] },
  "09-17": { feast: "Вяра, Надежда и Любов", names: ["Вяра", "Надежда", "Надя", "Любов", "Люба", "Любомир", "Любомира", "София"] },
  "10-14": { feast: "Петковден", names: ["Петко", "Петкана", "Параскева"] },
  "10-26": { feast: "Димитровден", names: ["Димитър", "Димитрина", "Митко", "Мита", "Митра"] },
  "11-08": { feast: "Архангеловден", names: ["Михаил", "Михаела", "Мишо", "Гавраил", "Ангел", "Ангелина", "Ангелика", "Рафаил"] },
  "11-25": { feast: "Екатерининден", names: ["Екатерина", "Катерина", "Катя"] },
  "11-30": { feast: "Андреевден", names: ["Андрей", "Андреа", "Андрея"] },
  "12-04": { feast: "Варвара", names: ["Варвара"] },
  "12-06": { feast: "Никулден", names: ["Никола", "Николай", "Николина", "Николета", "Кольо"] },
  "12-09": { feast: "Св. Анна", names: ["Анна", "Ана"] },
  "12-12": { feast: "Спиридоновден", names: ["Спиридон"] },
  "12-20": { feast: "Игнажден", names: ["Игнат", "Игнатий"] },
  "12-22": { feast: "Св. Анастасия", names: ["Анастасия"] },
  "12-25": { feast: "Рождество Христово", names: ["Христо", "Христина", "Христиана", "Кристиан", "Кристина", "Емануил"] },
  "12-27": { feast: "Стефановден", names: ["Стефан", "Стефка", "Стефания", "Стефани", "Венцислав", "Венцислава"] },
};

// days from the Orthodox Easter
const MOVABLE: { offset: number; feast: string; names: string[] }[] = [
  { offset: -43, feast: "Тодоровден", names: ["Тодор", "Теодор", "Тодорка", "Теодора"] },
  { offset: -8, feast: "Лазаровден", names: ["Лазар", "Лазарина"] },
  {
    offset: -7,
    feast: "Цветница",
    names: ["Цветан", "Цветана", "Цветелина", "Цветомир", "Цвета", "Цветко", "Лиляна", "Лилия", "Роза", "Росица", "Маргарита", "Жасмина", "Виолета", "Камелия"],
  },
  { offset: 39, feast: "Спасовден", names: ["Спас", "Спаска", "Спасимир"] },
];

const norm = (name: string) => name.trim().toLocaleLowerCase("bg");

/** The feast on which a first name celebrates, on this day — or null. */
export function nameDayOn(firstName: string, day: string): string | null {
  const name = norm(firstName);
  if (!name) return null;
  const fixed = FIXED[day.slice(5)];
  if (fixed?.names.some((n) => norm(n) === name)) return fixed.feast;
  const easter = orthodoxEaster(Number(day.slice(0, 4))).toISOString().slice(0, 10);
  for (const m of MOVABLE) {
    if (addDays(easter, m.offset) === day && m.names.some((n) => norm(n) === name)) return m.feast;
  }
  return null;
}

/** When a first name celebrates in a year: { day, feast } — or null for a name not in the calendar. */
export function nameDayIn(firstName: string, year: number): { day: string; feast: string } | null {
  const name = norm(firstName);
  for (const [md, f] of Object.entries(FIXED)) {
    if (f.names.some((n) => norm(n) === name)) return { day: `${year}-${md}`, feast: f.feast };
  }
  const easter = orthodoxEaster(year).toISOString().slice(0, 10);
  for (const m of MOVABLE) {
    if (m.names.some((n) => norm(n) === name)) return { day: addDays(easter, m.offset), feast: m.feast };
  }
  return null;
}
