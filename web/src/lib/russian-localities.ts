import localityRows from "@/data/russian-localities.json";

// Derived from the GeoNames Gazetteer populated-place dump through
// `cities-with-1000@1.0.4`. GeoNames data is CC BY 4.0:
// https://www.geonames.org/ · https://creativecommons.org/licenses/by/4.0/
// The compact tuple keeps the server bundle small enough for a local, keyless
// autocomplete that cannot go down with a third-party runtime API.
type LocalityRow = [
  name: string,
  asciiName: string,
  region: string,
  latitude: number,
  longitude: number,
  population: number,
];

export type RussianLocality = {
  id: string;
  name: string;
  region: string;
  country: "Россия";
  label: string;
  latitude: number;
  longitude: number;
};

const rows = localityRows as LocalityRow[];

function normalize(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();
}
function transliterateRussian(value: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return normalize(value).split("").map((letter) => map[letter] ?? letter).join("");
}

function asLocality(row: LocalityRow): RussianLocality {
  const [name, , region, latitude, longitude] = row;
  return {
    id: `${name}:${region}:${latitude}:${longitude}`,
    name,
    region,
    country: "Россия",
    label: `${name}, ${region}, Россия`,
    latitude,
    longitude,
  };
}

function queryParts(query: string) {
  const [city = "", region = ""] = query.split(",", 2).map((part) => normalize(part));
  return { city, region, asciiCity: transliterateRussian(city) };
}

export function searchRussianLocalities(query: string, limit = 8): RussianLocality[] {
  const { city, region, asciiCity } = queryParts(query);
  if (city.length < 2) return [];

  return rows
    .flatMap((row) => {
      const [name, asciiName, rowRegion, , , population] = row;
      const normalizedName = normalize(name);
      const normalizedAscii = normalize(asciiName);
      const normalizedRegion = normalize(rowRegion);
      if (region && !normalizedRegion.includes(region) && !region.includes(normalizedRegion)) return [];

      let rank = Number.POSITIVE_INFINITY;
      if (normalizedName === city || normalizedAscii === asciiCity) rank = 0;
      else if (normalizedName.startsWith(city)) rank = 1;
      else if (normalizedAscii.startsWith(asciiCity)) rank = 2;
      else if (normalizedName.includes(city) || normalizedAscii.includes(asciiCity)) rank = 3;
      if (!Number.isFinite(rank)) return [];
      return [{ row, rank, population }];
    })
    .sort((left, right) => left.rank - right.rank || right.population - left.population || left.row[0].localeCompare(right.row[0], "ru"))
    .slice(0, Math.max(1, Math.min(limit, 12)))
    .map(({ row }) => asLocality(row));
}

export function resolveRussianLocality(query: string): RussianLocality | null {
  const { city, region, asciiCity } = queryParts(query);
  if (city.length < 2) return null;
  const matches = rows.filter(([name, asciiName, rowRegion]) => {
    const cityMatches = normalize(name) === city || normalize(asciiName) === asciiCity;
    if (!cityMatches) return false;
    if (!region) return true;
    const normalizedRegion = normalize(rowRegion);
    return normalizedRegion.includes(region) || region.includes(normalizedRegion);
  });
  // A bare ambiguous name must be selected from suggestions or disambiguated
  // with a region. Guessing the most populous Pushkino can build a wrong chart.
  if (matches.length !== 1) return null;
  return asLocality(matches[0]);
}
