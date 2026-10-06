import type { Lang } from "./dictionaries";

/** The words of the owner's first-steps checklist on the home page. */
export const firstStepsText: Record<Lang, Record<string, string>> = {
  bg: {
    title: "Първи стъпки",
    progress: "{done} от {total} готови",
    hide: "Скрий",
    logo: "Качи логото на агенцията",
    logoHint: "Излиза на споделените имоти, отчетите и сайта.",
    offices: "Добави офис или екип",
    officesHint: "Ако имате повече от един офис или екип с ръководител.",
    invite: "Покани колегите",
    inviteHint: "Всеки брокер влиза със свой имейл.",
    property: "Въведи първия имот",
    propertyHint: "Със снимки, цена и квартал.",
    market: "Въведи пазарните цени",
    marketHint: "Средна цена на м² по квартали — за звездите и сравненията.",
  },
  en: {
    title: "First steps",
    progress: "{done} of {total} done",
    hide: "Hide",
    logo: "Upload the agency's logo",
    logoHint: "It shows on shared listings, reports and the website.",
    offices: "Add an office or a team",
    officesHint: "When you have more than one office, or teams with a leader.",
    invite: "Invite your colleagues",
    inviteHint: "Each broker signs in with their own email.",
    property: "Add the first property",
    propertyHint: "With photos, price and neighbourhood.",
    market: "Enter the market prices",
    marketHint: "The average price per m² by neighbourhood — for the stars and comparisons.",
  },
};
