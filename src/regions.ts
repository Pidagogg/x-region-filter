// ==== Regions: the countries and broad areas the user can pick ====
// X's "About this account" shows either a country ("Germany") or, for
// accounts that chose to show less, a broad area ("Western Europe"). Both are
// plain English strings, so everything here matches on a normalised form of
// that string. A pick is a key: "c:DE" for a country, "a:western europe" for
// a broad area. Picking a whole region picks all its countries *and* areas,
// so "Europe" also hides accounts X only shows as "Western Europe".
// Pure data and functions: no browser APIs, so the tests can import it.

export type RegionId = "europe" | "middleEast" | "asia" | "africa" | "northAmerica" | "latinAmerica" | "oceania";

export interface Country {
  code: string;
  /** English name as X is expected to show it */
  name: string;
  aliases: string[];
}

export interface Region {
  id: RegionId;
  countries: Country[];
  /** broad-area strings X may show instead of a country (unverified, see docs/x-api-notes.md) */
  areas: string[];
}

// "CODE Name/Alias/Alias|…" keeps the table readable
const C = (s: string): Country[] =>
  s.split("|").map((part) => {
    const sp = part.indexOf(" ");
    const [name, ...aliases] = part.slice(sp + 1).split("/");
    return { code: part.slice(0, sp), name, aliases };
  });

export const REGIONS: Region[] = [
  {
    id: "europe",
    countries: C(
      "AL Albania|AD Andorra|AT Austria|BY Belarus|BE Belgium|BA Bosnia and Herzegovina|BG Bulgaria|HR Croatia|CY Cyprus|CZ Czechia/Czech Republic|DK Denmark|EE Estonia|FI Finland|FR France|DE Germany|GR Greece|HU Hungary|IS Iceland|IE Ireland|IT Italy|XK Kosovo|LV Latvia|LI Liechtenstein|LT Lithuania|LU Luxembourg|MT Malta|MD Moldova|MC Monaco|ME Montenegro|NL Netherlands|MK North Macedonia/Macedonia|NO Norway|PL Poland|PT Portugal|RO Romania|RU Russia/Russian Federation|SM San Marino|RS Serbia|SK Slovakia|SI Slovenia|ES Spain|SE Sweden|CH Switzerland|UA Ukraine|GB United Kingdom/UK/Great Britain|VA Vatican City/Holy See"
    ),
    areas: ["Europe", "Western Europe", "Eastern Europe", "Northern Europe", "Southern Europe", "Central Europe"],
  },
  {
    id: "middleEast",
    countries: C(
      "BH Bahrain|IR Iran|IQ Iraq|IL Israel|JO Jordan|KW Kuwait|LB Lebanon|OM Oman|PS Palestine/Palestinian Territories|QA Qatar|SA Saudi Arabia|SY Syria|TR Turkey/Türkiye|AE United Arab Emirates/UAE|YE Yemen"
    ),
    areas: ["Middle East", "West Asia", "Middle East and North Africa"],
  },
  {
    id: "asia",
    countries: C(
      "AF Afghanistan|AM Armenia|AZ Azerbaijan|BD Bangladesh|BT Bhutan|BN Brunei|KH Cambodia|CN China|GE Georgia|HK Hong Kong|IN India|ID Indonesia|JP Japan|KZ Kazakhstan|KG Kyrgyzstan|LA Laos|MO Macao/Macau|MY Malaysia|MV Maldives|MN Mongolia|MM Myanmar/Burma|NP Nepal|KP North Korea|PK Pakistan|PH Philippines|SG Singapore|KR South Korea/Korea|LK Sri Lanka|TW Taiwan|TJ Tajikistan|TH Thailand|TL Timor-Leste/East Timor|TM Turkmenistan|UZ Uzbekistan|VN Vietnam/Viet Nam"
    ),
    areas: ["Asia", "East Asia", "South Asia", "Southeast Asia", "Central Asia", "Asia Pacific"],
  },
  {
    id: "africa",
    countries: C(
      "DZ Algeria|AO Angola|BJ Benin|BW Botswana|BF Burkina Faso|BI Burundi|CV Cape Verde/Cabo Verde|CM Cameroon|CF Central African Republic|TD Chad|KM Comoros|CG Congo/Republic of the Congo|CD DR Congo/Democratic Republic of the Congo|CI Côte d'Ivoire/Ivory Coast|DJ Djibouti|EG Egypt|GQ Equatorial Guinea|ER Eritrea|SZ Eswatini/Swaziland|ET Ethiopia|GA Gabon|GM Gambia|GH Ghana|GN Guinea|GW Guinea-Bissau|KE Kenya|LS Lesotho|LR Liberia|LY Libya|MG Madagascar|MW Malawi|ML Mali|MR Mauritania|MU Mauritius|MA Morocco|MZ Mozambique|NA Namibia|NE Niger|NG Nigeria|RW Rwanda|ST São Tomé and Príncipe|SN Senegal|SC Seychelles|SL Sierra Leone|SO Somalia|ZA South Africa|SS South Sudan|SD Sudan|TZ Tanzania|TG Togo|TN Tunisia|UG Uganda|ZM Zambia|ZW Zimbabwe"
    ),
    areas: ["Africa", "North Africa", "West Africa", "East Africa", "Central Africa", "Southern Africa", "Sub-Saharan Africa"],
  },
  {
    id: "northAmerica",
    countries: C("US United States/USA/United States of America|CA Canada|GL Greenland|BM Bermuda"),
    areas: ["North America"],
  },
  {
    id: "latinAmerica",
    countries: C(
      "MX Mexico|BZ Belize|CR Costa Rica|SV El Salvador|GT Guatemala|HN Honduras|NI Nicaragua|PA Panama|AR Argentina|BO Bolivia|BR Brazil|CL Chile|CO Colombia|EC Ecuador|GY Guyana|PY Paraguay|PE Peru|SR Suriname|UY Uruguay|VE Venezuela|AG Antigua and Barbuda|BS Bahamas|BB Barbados|CU Cuba|DM Dominica|DO Dominican Republic|GD Grenada|HT Haiti|JM Jamaica|KN Saint Kitts and Nevis/St Kitts and Nevis|LC Saint Lucia/St Lucia|VC Saint Vincent and the Grenadines|TT Trinidad and Tobago|PR Puerto Rico"
    ),
    areas: ["Latin America", "South America", "Central America", "Caribbean", "Latin America and the Caribbean"],
  },
  {
    id: "oceania",
    countries: C(
      "AU Australia|NZ New Zealand|FJ Fiji|PG Papua New Guinea|SB Solomon Islands|VU Vanuatu|WS Samoa|TO Tonga|KI Kiribati|FM Micronesia|MH Marshall Islands|PW Palau|NR Nauru|TV Tuvalu"
    ),
    areas: ["Oceania", "Australasia", "Pacific Islands"],
  },
];

// ---- matching ----

/** "Bosnia & Herzegovina", "the Bahamas", "Côte d’Ivoire" → comparable lowercase ASCII */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’'`.]/g, "")
    // Any script's letters survive, so Russian queries filter too (NFD above already folds ё to е).
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

export const countryKey = (code: string) => `c:${code}`;
export const areaKey = (area: string) => `a:${normalize(area)}`;

const LOOKUP = new Map<string, string>();
for (const r of REGIONS) {
  for (const c of r.countries) for (const n of [c.name, ...c.aliases]) LOOKUP.set(normalize(n), countryKey(c.code));
  for (const a of r.areas) LOOKUP.set(normalize(a), areaKey(a));
}

/** The pick key an X value belongs to, or null when we don't know the string. */
export function keyFor(value: string): string | null {
  return LOOKUP.get(normalize(value)) ?? null;
}

export function regionKeys(r: Region): string[] {
  return [...r.countries.map((c) => countryKey(c.code)), ...r.areas.map(areaKey)];
}

export type RegionState = "none" | "some" | "all";

export function regionState(r: Region, selected: ReadonlySet<string>): RegionState {
  const keys = regionKeys(r);
  const n = keys.filter((k) => selected.has(k)).length;
  return n === 0 ? "none" : n === keys.length ? "all" : "some";
}

/** The whole-region switch: on picks every country and area in it, off clears them. */
export function toggleRegion(r: Region, selected: readonly string[], on: boolean): string[] {
  const keys = new Set(regionKeys(r));
  const rest = selected.filter((k) => !keys.has(k));
  return on ? [...rest, ...keys] : rest;
}

export function toggleKey(selected: readonly string[], key: string, on: boolean): string[] {
  const rest = selected.filter((k) => k !== key);
  return on ? [...rest, key] : rest;
}

/** The country code behind an X value, for showing it in the user's language. */
export function countryCodeFor(value: string): string | null {
  const k = keyFor(value);
  return k?.startsWith("c:") ? k.slice(2) : null;
}
