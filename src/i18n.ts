// English and Russian UI texts; the browser language picks one.
import { promoLink } from "./links.ts";
import { countryCodeFor, type Country, type RegionId } from "./regions.ts";

const en = {
  name: "Region Filter for X",
  tagline: "Hide posts from accounts based in the regions you choose, based on what X shows in About this account.",
  enabled: "Filter on",
  modeTitle: "Matching posts",
  modeCollapse: "Collapse to a slim bar",
  modeRemove: "Remove completely",
  hideUnknown: "Also hide accounts with unknown region",
  pickTitle: "Hide posts from accounts based in",
  search: "Search countries and regions…",
  wholeRegion: "Whole region",
  areas: "Broad areas X may show instead of a country",
  countries: "Countries",
  noMatch: "Nothing found.",
  selectedNone: "Nothing picked yet, so no posts are hidden.",
  selected: (n: number) => `${n} picked`,
  clear: "Clear",
  hiddenCount: (n: number) => `Posts hidden so far: ${n}`,
  allowTitle: "Always shown",
  remove: "Remove",
  // the bar on x.com
  barHidden: (region: string) => `Hidden: account based in ${region}`,
  barUnknown: "Hidden: account region unknown",
  show: "Show",
  alwaysShow: (h: string) => `Always show @${h}`,
  grantTitle: "Access to x.com is needed",
  grant: "Allow on x.com",
  note: "Lookups use your own X session and go only to X. X may limit them, so new accounts can take a moment to be checked.",
  promoTitle: "W flow — automate your feeds and alerts",
  promo: "Connect apps, feeds and AI by dragging blocks, no code. Free to start →",
  // the popup's status line (status.ts)
  statusOff: "Filter off",
  statusLoggedOut: "Log in to X to check regions",
  statusPaused: (time: string) => `Paused until ${time} (X is limiting requests)`,
  statusHourly: (time: string) => `Hourly limit reached, resumes at ${time}`,
  statusBroken: "X changed something — lookups failing; update the extension",
  statusActive: "Active",
  // the welcome page, opened once after install
  welcomeTitle: "Welcome to Region Filter for X",
  welcomeLead: "Three steps, and posts from accounts based in the regions you pick collapse on x.com. Regions are based on what X shows in About this account.",
  step1Title: "Pick what to hide",
  step1: "One click picks a whole region. Single countries and broad areas are in the toolbar popup.",
  step2Title: "Open X, logged in",
  step2: "Lookups use your own X session and go only to X. New accounts can take a moment to be checked.",
  openX: "Open x.com",
  step3Title: "Change it any time",
  step3: "Matching posts collapse to a slim bar: Show opens one, Always show @name keeps an account visible. Pin the extension to the toolbar to change anything later.",
  privacy: "Nothing is collected or tracked. Your choices stay in this browser.",
};
const ru: typeof en = {
  name: "Region Filter for X",
  tagline: "Скрывает посты аккаунтов из выбранных регионов — по данным X в разделе «Об этом аккаунте».",
  enabled: "Фильтр включён",
  modeTitle: "Подходящие посты",
  modeCollapse: "Свернуть в тонкую полоску",
  modeRemove: "Убрать полностью",
  hideUnknown: "Скрывать и аккаунты с неизвестным регионом",
  pickTitle: "Скрывать посты аккаунтов из",
  search: "Поиск стран и регионов…",
  wholeRegion: "Весь регион",
  areas: "Крупные области, которые X может показать вместо страны",
  countries: "Страны",
  noMatch: "Ничего не найдено.",
  selectedNone: "Пока ничего не выбрано, поэтому посты не скрываются.",
  selected: (n: number) => `Выбрано: ${n}`,
  clear: "Сбросить",
  hiddenCount: (n: number) => `Скрыто постов: ${n}`,
  allowTitle: "Всегда показывать",
  remove: "Убрать",
  barHidden: (region: string) => `Скрыто: аккаунт из региона «${region}»`,
  barUnknown: "Скрыто: регион аккаунта неизвестен",
  show: "Показать",
  alwaysShow: (h: string) => `Всегда показывать @${h}`,
  grantTitle: "Нужен доступ к x.com",
  grant: "Разрешить на x.com",
  note: "Запросы идут только в X, от вашей учётной записи. X может их ограничивать, поэтому новые аккаунты проверяются не сразу.",
  promoTitle: "W flow — автоматизируйте ленты и оповещения",
  promo: "Соединяйте сервисы, ленты и ИИ из блоков, без кода. Бесплатный старт →",
  statusOff: "Фильтр выключен",
  statusLoggedOut: "Войдите в X, чтобы проверять регионы",
  statusPaused: (time: string) => `Пауза до ${time} (X ограничивает запросы)`,
  statusHourly: (time: string) => `Лимит на час исчерпан, продолжим в ${time}`,
  statusBroken: "X что-то изменил — запросы не проходят; обновите расширение",
  statusActive: "Работает",
  welcomeTitle: "Добро пожаловать в Region Filter for X",
  welcomeLead: "Три шага — и посты аккаунтов из выбранных регионов на x.com сворачиваются. Регион берётся из данных X в разделе «Об этом аккаунте».",
  step1Title: "Выберите, что скрывать",
  step1: "Один клик выбирает весь регион. Отдельные страны и области — во всплывающем окне на панели инструментов.",
  step2Title: "Откройте X и войдите",
  step2: "Запросы идут только в X, от вашей учётной записи. Новые аккаунты проверяются не сразу.",
  openX: "Открыть x.com",
  step3Title: "Меняйте когда угодно",
  step3: "Подходящие посты сворачиваются в тонкую полоску: «Показать» раскрывает пост, «Всегда показывать @имя» оставляет аккаунт видимым. Закрепите расширение на панели, чтобы потом всё менять.",
  privacy: "Ничего не собирается и не отслеживается. Ваш выбор хранится только в этом браузере.",
};

const REGION_NAMES: Record<"en" | "ru", Record<RegionId, string>> = {
  en: { europe: "Europe", middleEast: "Middle East", asia: "Asia", africa: "Africa", northAmerica: "North America", latinAmerica: "Latin America & Caribbean", oceania: "Oceania" },
  ru: { europe: "Европа", middleEast: "Ближний Восток", asia: "Азия", africa: "Африка", northAmerica: "Северная Америка", latinAmerica: "Латинская Америка и Карибы", oceania: "Океания" },
};

// X shows broad areas in English; these are only the Russian labels for the picker and the bar
const AREAS_RU: Record<string, string> = {
  Europe: "Европа", "Western Europe": "Западная Европа", "Eastern Europe": "Восточная Европа", "Northern Europe": "Северная Европа", "Southern Europe": "Южная Европа", "Central Europe": "Центральная Европа",
  "Middle East": "Ближний Восток", "West Asia": "Западная Азия", "Middle East and North Africa": "Ближний Восток и Северная Африка",
  Asia: "Азия", "East Asia": "Восточная Азия", "South Asia": "Южная Азия", "Southeast Asia": "Юго-Восточная Азия", "Central Asia": "Центральная Азия", "Asia Pacific": "Азиатско-Тихоокеанский регион",
  Africa: "Африка", "North Africa": "Северная Африка", "West Africa": "Западная Африка", "East Africa": "Восточная Африка", "Central Africa": "Центральная Африка", "Southern Africa": "Южная Африка (регион)", "Sub-Saharan Africa": "Африка южнее Сахары",
  "North America": "Северная Америка",
  "Latin America": "Латинская Америка", "South America": "Южная Америка", "Central America": "Центральная Америка", Caribbean: "Карибы", "Latin America and the Caribbean": "Латинская Америка и Карибы",
  Oceania: "Океания", Australasia: "Австралазия", "Pacific Islands": "Острова Тихого океана",
};

export type Texts = typeof en;
/** Russian only for a Russian browser; Ukrainian, Belarusian and Kazakh users get English, not Russian. */
export const pickLang = (browserLang: string | undefined): "en" | "ru" => (/^ru(-|$)/i.test(browserLang || "") ? "ru" : "en");
export const lang = pickLang(globalThis.navigator?.language);
export const t: Texts = lang === "ru" ? ru : en;

export const regionName = (id: RegionId) => REGION_NAMES[lang][id];
export const areaName = (area: string) => (lang === "ru" && AREAS_RU[area]) || area;

const display = (() => {
  try {
    return new Intl.DisplayNames([lang], { type: "region" });
  } catch {
    return null;
  }
})();

export const countryName = (c: Country) => (lang === "en" ? c.name : display?.of(c.code) || c.name);

/** An X value ("Germany", "Western Europe") in the user's language, for the bar. */
export function placeName(value: string): string {
  const code = countryCodeFor(value);
  if (code && lang !== "en") return display?.of(code) || value;
  return areaName(value);
}

export const promoUrl = (place: string) => promoLink(place);

/** A time of day ("14:30") in the browser's own format. */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString(globalThis.navigator?.language || lang, { hour: "2-digit", minute: "2-digit" });
