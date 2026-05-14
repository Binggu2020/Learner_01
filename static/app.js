const input = document.querySelector("#city-input");
const suggestions = document.querySelector("#suggestions");
const statusBox = document.querySelector("#status");
const weatherCard = document.querySelector("#weather-card");
const weatherIcon = document.querySelector("#weather-icon");
const place = document.querySelector("#place");
const temperature = document.querySelector("#temperature");
const condition = document.querySelector("#condition");
const wind = document.querySelector("#wind");
const updated = document.querySelector("#updated");

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const USE_BACKEND = window.location.protocol !== "file:";

let activeController;
let debounceTimer;

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
  statusBox.classList.remove("hidden");
}

function clearSuggestions() {
  suggestions.innerHTML = "";
  input.setAttribute("aria-expanded", "false");
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function formatTime(value) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat([], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function fetchCities(query) {
  if (activeController) activeController.abort();
  activeController = new AbortController();

  if (!USE_BACKEND) {
    return fetchCitiesFromOpenMeteo(query, activeController.signal);
  }

  const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`, {
    signal: activeController.signal,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "City lookup failed.");
  return payload.cities || [];
}

async function fetchCitiesFromOpenMeteo(query, signal) {
  const params = new URLSearchParams({
    name: query,
    count: "10",
    language: "en",
    format: "json",
  });
  const response = await fetch(`${GEOCODING_URL}?${params}`, { signal });
  if (!response.ok) throw new Error("City lookup is unavailable right now.");
  const payload = await response.json();
  return (payload.results || [])
    .filter((result) => result.country_code === "AU")
    .filter((result) => result.name && result.latitude != null && result.longitude != null)
    .map((result) => ({
      name: result.name,
      region: result.admin1 || "",
      latitude: result.latitude,
      longitude: result.longitude,
    }));
}

async function fetchWeather(city) {
  if (!USE_BACKEND) {
    return fetchWeatherFromOpenMeteo(city);
  }

  const params = new URLSearchParams({
    lat: city.latitude,
    lon: city.longitude,
    name: city.name,
    region: city.region || "",
  });
  const response = await fetch(`/api/weather?${params}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Weather lookup failed.");
  return payload;
}

async function fetchWeatherFromOpenMeteo(city) {
  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    current: "temperature_2m,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error("Weather data is unavailable right now.");
  const payload = await response.json();
  const current = payload.current || {};
  const conditions = weatherForCode(current.weather_code);
  return {
    city: city.name,
    region: city.region || "",
    temperature: current.temperature_2m,
    condition: conditions.label,
    icon: conditions.icon,
    wind_speed: current.wind_speed_10m,
    time: current.time,
  };
}

function weatherForCode(code) {
  const weatherCodes = {
    0: ["Clear sky", "sun"],
    1: ["Mainly clear", "sun"],
    2: ["Partly cloudy", "cloud-sun"],
    3: ["Overcast", "cloud"],
    45: ["Fog", "fog"],
    48: ["Depositing rime fog", "fog"],
    51: ["Light drizzle", "cloud-drizzle"],
    53: ["Moderate drizzle", "cloud-drizzle"],
    55: ["Dense drizzle", "cloud-drizzle"],
    56: ["Light freezing drizzle", "cloud-drizzle"],
    57: ["Dense freezing drizzle", "cloud-drizzle"],
    61: ["Slight rain", "cloud-rain"],
    63: ["Moderate rain", "cloud-rain"],
    65: ["Heavy rain", "cloud-rain"],
    66: ["Light freezing rain", "cloud-rain"],
    67: ["Heavy freezing rain", "cloud-rain"],
    71: ["Slight snow", "snowflake"],
    73: ["Moderate snow", "snowflake"],
    75: ["Heavy snow", "snowflake"],
    77: ["Snow grains", "snowflake"],
    80: ["Slight rain showers", "cloud-rain"],
    81: ["Moderate rain showers", "cloud-rain"],
    82: ["Violent rain showers", "cloud-rain"],
    85: ["Slight snow showers", "snowflake"],
    86: ["Heavy snow showers", "snowflake"],
    95: ["Thunderstorm", "cloud-lightning"],
    96: ["Thunderstorm with slight hail", "cloud-lightning"],
    99: ["Thunderstorm with heavy hail", "cloud-lightning"],
  };
  const [label, icon] = weatherCodes[code] || ["Unknown conditions", "cloud"];
  return { label, icon };
}

function showWeather(data) {
  weatherCard.classList.remove("hidden");
  statusBox.classList.add("hidden");
  weatherIcon.setAttribute("data-lucide", data.icon || "cloud-question");
  place.textContent = data.region ? `${data.city}, ${data.region}` : data.city;
  temperature.textContent = data.temperature == null ? "--" : `${Math.round(data.temperature)}°C`;
  condition.textContent = data.condition || "Unknown conditions";
  wind.textContent = data.wind_speed == null ? "Unavailable" : `${Math.round(data.wind_speed)} km/h`;
  updated.textContent = formatTime(data.time);
  renderIcons();
}

function renderSuggestions(cities) {
  clearSuggestions();
  if (!cities.length) {
    setStatus("No Australian cities matched that search.", true);
    return;
  }

  statusBox.classList.add("hidden");
  input.setAttribute("aria-expanded", "true");
  cities.forEach((city) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.innerHTML = `<strong>${city.name}</strong><span>${city.region || "Australia"}</span>`;
    button.addEventListener("click", async () => {
      clearSuggestions();
      input.value = city.region ? `${city.name}, ${city.region}` : city.name;
      setStatus("Loading current weather...");
      try {
        showWeather(await fetchWeather(city));
      } catch (error) {
        weatherCard.classList.add("hidden");
        setStatus(error.message, true);
      }
    });
    item.appendChild(button);
    suggestions.appendChild(item);
  });
}

input.addEventListener("input", () => {
  const query = input.value.trim();
  weatherCard.classList.add("hidden");
  window.clearTimeout(debounceTimer);

  if (query.length < 2) {
    clearSuggestions();
    setStatus("Enter at least two letters to search Australian cities.");
    return;
  }

  debounceTimer = window.setTimeout(async () => {
    setStatus("Searching Australian cities...");
    try {
      renderSuggestions(await fetchCities(query));
    } catch (error) {
      if (error.name !== "AbortError") {
        clearSuggestions();
        setStatus(error.message, true);
      }
    }
  }, 250);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search")) clearSuggestions();
});

renderIcons();
