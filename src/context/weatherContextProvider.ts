import type { AthleteProfile } from "../profile.js";
import type { ContextProvider } from "./types.js";

interface Coords {
  lat: number;
  lon: number;
}

/** Fetches current weather for the athlete's profile location via Open-Meteo (free, no API key). */
export function createWeatherContextProvider(profile: AthleteProfile): ContextProvider {
  let coords: Coords | null = null;

  return {
    id: "weather",
    async load() {
      if (!profile.location) return "";

      try {
        coords ??= await geocode(profile.location);
        if (!coords) return "";

        const current = await fetchCurrentWeather(coords);
        return `Current Weather (${profile.location}): ${current.temperature}°C, ${describeWeatherCode(current.weatherCode)}, wind ${current.windSpeed} km/h`;
      } catch {
        // Never break session creation over a flaky external API.
        return "";
      }
    },
  };
}

async function geocode(location: string): Promise<Coords | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as { results?: { latitude: number; longitude: number }[] };
  const result = data.results?.[0];
  return result ? { lat: result.latitude, lon: result.longitude } : null;
}

async function fetchCurrentWeather(
  coords: Coords
): Promise<{ temperature: number; weatherCode: number; windSpeed: number }> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lon));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo forecast request failed: ${response.status}`);

  const data = (await response.json()) as {
    current: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
  };

  return {
    temperature: data.current.temperature_2m,
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
  };
}

/** Maps Open-Meteo's WMO weather codes to a short human description. */
function describeWeatherCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: "clear sky",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "depositing rime fog",
    51: "light drizzle",
    53: "moderate drizzle",
    55: "dense drizzle",
    61: "slight rain",
    63: "moderate rain",
    65: "heavy rain",
    71: "slight snow",
    73: "moderate snow",
    75: "heavy snow",
    80: "slight rain showers",
    81: "moderate rain showers",
    82: "violent rain showers",
    95: "thunderstorm",
  };
  return descriptions[code] ?? "unknown conditions";
}
