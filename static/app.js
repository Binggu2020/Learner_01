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
const recentSearchesSection = document.querySelector("#recent-searches");
const recentList = document.querySelector("#recent-list");
const clearRecentButton = document.querySelector("#clear-recent");
const forecastSection = document.querySelector("#forecast-section");
const forecastList = document.querySelector("#forecast-list");

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const USE_BACKEND = window.location.protocol !== "file:";
const RECENT_SEARCHES_KEY = "weather-recent-searches";
const MAX_RECENT_SEARCHES = 5;
const TEMPERATURE_UNIT_KEY = "weather-temp-unit";
const WIND_UNIT_KEY = "weather-wind-unit";

let activeController;
let debounceTimer;
let currentWeatherData = null;

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

function getRecentSearches() {
  const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRecentSearches(searches) {
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
}

function addRecentSearch(city) {
  const searches = getRecentSearches().filter(
    (item) => item.name !== city.name || item.region !== city.region
  );

  searches.unshift({
    name: city.name,
    region: city.region || "",
    latitude: city.latitude,
    longitude: city.longitude,
  });

  saveRecentSearches(searches.slice(0, MAX_RECENT_SEARCHES));
  renderRecentSearches();
}

function clearRecentSearches() {
  window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  renderRecentSearches();
}

function renderRecentSearches() {
  const searches = getRecentSearches();
  recentList.innerHTML = "";

  if (!searches.length) {
    recentSearchesSection.classList.add("hidden");
    return;
  }

  recentSearchesSection.classList.remove("hidden");

  searches.forEach((city) => {
    const item = document.createElement("li");
    const button = document.createElement("button");

    button.type = "button";
    button.className = "recent-item";
    const label = document.createElement("span");
    const region = document.createElement("span");

    label.className = "recent-label";
    label.textContent = city.name;
    region.className = "recent-region";
    region.textContent = city.region || "Australia";

    button.appendChild(label);
    button.appendChild(region);
    button.addEventListener("click", async () => {
      setStatus("Loading current weather...");
      try {
        showWeather(await fetchWeather(city));
        addRecentSearch(city);
      } catch (error) {
        weatherCard.classList.add("hidden");
        setStatus(error.message, true);
      }
    });

    item.appendChild(button);
    recentList.appendChild(item);
  });
}

function formatTime(value) {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat([], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTemperatureUnit() {
  return window.localStorage.getItem(TEMPERATURE_UNIT_KEY) || "celsius";
}

function getWindUnit() {
  return window.localStorage.getItem(WIND_UNIT_KEY) || "kmh";
}

function setTemperatureUnit(unit) {
  window.localStorage.setItem(TEMPERATURE_UNIT_KEY, unit);
  updateUnitButtonStates();
  if (currentWeatherData) {
    displayWeather(currentWeatherData);
  }
}

function setWindUnit(unit) {
  window.localStorage.setItem(WIND_UNIT_KEY, unit);
  updateUnitButtonStates();
  if (currentWeatherData) {
    displayWeather(currentWeatherData);
  }
}

function updateUnitButtonStates() {
  const tempUnit = getTemperatureUnit();
  const windUnit = getWindUnit();
  
  document.querySelectorAll("[data-unit]").forEach((btn) => {
    btn.classList.toggle("active", 
      (btn.dataset.unit === tempUnit && (tempUnit === "celsius" || tempUnit === "fahrenheit")) ||
      (btn.dataset.unit === windUnit && (windUnit === "kmh" || windUnit === "mph"))
    );
  });
}

function convertTemperature(celsius) {
  if (celsius == null) return null;
  if (getTemperatureUnit() === "fahrenheit") {
    return (celsius * 9/5) + 32;
  }
  return celsius;
}

function convertWindSpeed(kmh) {
  if (kmh == null) return null;
  if (getWindUnit() === "mph") {
    return kmh / 1.60934;
  }
  return kmh;
}

function formatTemperature(celsius) {
  const temp = convertTemperature(celsius);
  if (temp == null) return "--";
  const unit = getTemperatureUnit() === "fahrenheit" ? "°F" : "°C";
  return `${Math.round(temp)}${unit}`;
}

function formatWindSpeed(kmh) {
  const speed = convertWindSpeed(kmh);
  if (speed == null) return "Unavailable";
  const unit = getWindUnit() === "mph" ? "mph" : "km/h";
  return `${Math.round(speed)} ${unit}`;
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
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error("Weather data is unavailable right now.");
  const payload = await response.json();
  const current = payload.current || {};
  const conditions = weatherForCode(current.weather_code);
  
  const daily = payload.daily || {};
  const dailyTimes = daily.time || [];
  const dailyCodes = daily.weather_code || [];
  const dailyMax = daily.temperature_2m_max || [];
  const dailyMin = daily.temperature_2m_min || [];
  
  const forecast = [];
  for (let i = 0; i < Math.min(7, dailyTimes.length); i++) {
    forecast.push({
      date: dailyTimes[i],
      code: dailyCodes[i],
      icon: weatherForCode(dailyCodes[i]).icon,
      condition: weatherForCode(dailyCodes[i]).label,
      max_temp: dailyMax[i],
      min_temp: dailyMin[i],
    });
  }
  
  return {
    city: city.name,
    region: city.region || "",
    temperature: current.temperature_2m,
    condition: conditions.label,
    icon: conditions.icon,
    wind_speed: current.wind_speed_10m,
    time: current.time,
    forecast: forecast,
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

function displayWeather(data) {
  weatherCard.classList.remove("hidden");
  statusBox.classList.add("hidden");
  weatherIcon.setAttribute("data-lucide", data.icon || "cloud-question");
  place.textContent = data.region ? `${data.city}, ${data.region}` : data.city;
  temperature.textContent = formatTemperature(data.temperature);
  condition.textContent = data.condition || "Unknown conditions";
  wind.textContent = formatWindSpeed(data.wind_speed);
  updated.textContent = formatTime(data.time);
  
  if (data.forecast && data.forecast.length > 0) {
    renderForecast(data.forecast);
  } else {
    forecastSection.classList.add("hidden");
  }
  
  renderIcons();
}

function showWeather(data) {
  currentWeatherData = data;
  displayWeather(data);
}

function renderForecast(forecast) {
  forecastList.innerHTML = "";
  forecastSection.classList.remove("hidden");
  
  forecast.forEach((day) => {
    const dayCard = document.createElement("div");
    dayCard.className = "forecast-day";
    
    const dateStr = new Date(day.date).toLocaleDateString([], { 
      weekday: "short", 
      month: "short", 
      day: "numeric" 
    });
    
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", day.icon || "cloud");
    
    const temps = document.createElement("div");
    temps.className = "forecast-temps";
    temps.innerHTML = `
      <span class="temp-max">${formatTemperature(day.max_temp)}</span>
      <span class="temp-min">${formatTemperature(day.min_temp)}</span>
    `;
    
    dayCard.innerHTML = `<div class="forecast-date">${dateStr}</div>`;
    dayCard.appendChild(icon);
    dayCard.appendChild(temps);
    
    forecastList.appendChild(dayCard);
  });
  
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
        addRecentSearch(city);
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

clearRecentButton.addEventListener("click", clearRecentSearches);

document.querySelectorAll("[data-unit]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const unit = btn.dataset.unit;
    if (unit === "celsius" || unit === "fahrenheit") {
      setTemperatureUnit(unit);
    } else if (unit === "kmh" || unit === "mph") {
      setWindUnit(unit);
    }
  });
});

updateUnitButtonStates();
renderRecentSearches();
renderIcons();
