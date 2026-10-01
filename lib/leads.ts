/** Who fills in a survey (the contacts' type) and where the ad runs (their source). */
export const LEAD_FORM_TYPES = ["buyer", "seller", "tenant", "landlord", "investor"] as const;
export const LEAD_FORM_SOURCES = [
  "form",
  "facebook",
  "instagram",
  "google",
  "tiktok",
  "website",
  "email",
  "flyers",
  "billboard",
  "banner",
  "realistimo",
] as const;

export type LeadAnswer = { q: string; a: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[\d\s\-()./]{7,}$/;

/**
 * The name, phone and e-mail among a form's answers — by the question ("Име", "Телефон",
 * "Имейл"…), else by what the answer looks like.
 */
export function readContact(answers: LeadAnswer[], respondentEmail: string | null) {
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = respondentEmail && EMAIL.test(respondentEmail) ? respondentEmail : null;
  for (const { q, a } of answers) {
    const question = q.toLowerCase();
    const answer = a.trim();
    if (!answer) continue;
    // the e-mail first: "имейл" holds "име"
    if (/(имейл|мейл|e-?mail|поща)/.test(question)) {
      if (!email && EMAIL.test(answer)) email = answer;
    } else if (/(телефон|тел\.|gsm|мобилен|phone|за връзка)/.test(question)) {
      if (!phone && PHONE.test(answer)) phone = answer;
    } else if (/(име|name)/.test(question)) {
      if (!name) name = answer;
    }
  }
  // no question named them: an answer that looks like a phone / an e-mail
  for (const { a } of answers) {
    const answer = a.trim();
    if (!phone && PHONE.test(answer) && answer.replace(/\D/g, "").length >= 8) phone = answer;
    if (!email && EMAIL.test(answer)) email = answer;
  }
  return { name, phone, email };
}

/** The script pasted into the Google Form: "install" once, then every answer goes to BRIXA. */
export function formScript(url: string, formName: string) {
  return `// BRIXA — „${formName.replace(/[\r\n]/g, " ")}“
// Всеки нов отговор отива в BRIXA като студен контакт.
var BRIXA = "${url}";

// Изпълни веднъж (▶): свързва формата с BRIXA.
function install() {
  var form = FormApp.getActiveForm();
  if (!form) {
    throw new Error("Постави кода в Apps Script на самата форма (във формата: ⋮ → Apps Script), не в таблицата с отговорите.");
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendToBrixa") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendToBrixa").forForm(form).onFormSubmit().create();
  var r = UrlFetchApp.fetch(BRIXA, { method: "post", contentType: "application/json", payload: JSON.stringify({ ping: true }), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) {
    throw new Error("BRIXA не прие връзката (" + r.getResponseCode() + "). Копирай кода наново от BRIXA — папката може да е архивирана.");
  }
  Logger.log("✅ Свързано с BRIXA. Обнови страницата „Студени контакти“.");
}

function sendToBrixa(e) {
  if (!e || !e.response) {
    throw new Error("Тази функция се пуска сама при нов отговор. Изпълни „install“.");
  }
  var answers = e.response.getItemResponses().map(function (r) {
    var a = r.getResponse();
    return { q: r.getItem().getTitle(), a: Array.isArray(a) ? a.join(", ") : String(a) };
  });
  var email = "";
  try { email = e.response.getRespondentEmail(); } catch (err) {}
  var r = UrlFetchApp.fetch(BRIXA, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ answers: answers, email: email || null }),
    muteHttpExceptions: true
  });
  Logger.log("BRIXA: " + r.getResponseCode() + " " + r.getContentText());
}
`;
}
