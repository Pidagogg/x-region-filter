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
export const lang: "en" | "ru" = /^ru|^uk|^be|^kk/i.test(globalThis.navigator?.language || "") ? "ru" : "en";
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
