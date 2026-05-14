from __future__ import annotations

from typing import Any

import requests
from flask import Flask, jsonify, render_template, request


app = Flask(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT = 8


WEATHER_CODES: dict[int, tuple[str, str]] = {
    0: ("Clear sky", "sun"),
    1: ("Mainly clear", "sun"),
    2: ("Partly cloudy", "cloud-sun"),
    3: ("Overcast", "cloud"),
    45: ("Fog", "fog"),
    48: ("Depositing rime fog", "fog"),
    51: ("Light drizzle", "cloud-drizzle"),
    53: ("Moderate drizzle", "cloud-drizzle"),
    55: ("Dense drizzle", "cloud-drizzle"),
    56: ("Light freezing drizzle", "cloud-drizzle"),
    57: ("Dense freezing drizzle", "cloud-drizzle"),
    61: ("Slight rain", "cloud-rain"),
    63: ("Moderate rain", "cloud-rain"),
    65: ("Heavy rain", "cloud-rain"),
    66: ("Light freezing rain", "cloud-rain"),
    67: ("Heavy freezing rain", "cloud-rain"),
    71: ("Slight snow", "snowflake"),
    73: ("Moderate snow", "snowflake"),
    75: ("Heavy snow", "snowflake"),
    77: ("Snow grains", "snowflake"),
    80: ("Slight rain showers", "cloud-rain"),
    81: ("Moderate rain showers", "cloud-rain"),
    82: ("Violent rain showers", "cloud-rain"),
    85: ("Slight snow showers", "snowflake"),
    86: ("Heavy snow showers", "snowflake"),
    95: ("Thunderstorm", "cloud-lightning"),
    96: ("Thunderstorm with slight hail", "cloud-lightning"),
    99: ("Thunderstorm with heavy hail", "cloud-lightning"),
}


def weather_for_code(code: int | None) -> dict[str, str]:
    label, icon = WEATHER_CODES.get(code or -1, ("Unknown conditions", "cloud-question"))
    return {"label": label, "icon": icon}


def get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/api/cities")
def cities():
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return jsonify({"cities": []})

    try:
        payload = get_json(
            GEOCODING_URL,
            {
                "name": query,
                "count": 10,
                "language": "en",
                "format": "json",
            },
        )
    except requests.RequestException:
        return jsonify({"error": "City lookup is unavailable right now."}), 502

    results = payload.get("results", [])
    au_cities = [
        {
            "name": result.get("name", ""),
            "region": result.get("admin1", ""),
            "latitude": result.get("latitude"),
            "longitude": result.get("longitude"),
        }
        for result in results
        if result.get("country_code") == "AU"
        and result.get("name")
        and result.get("latitude") is not None
        and result.get("longitude") is not None
    ]
    return jsonify({"cities": au_cities})


@app.get("/api/weather")
def weather():
    latitude = request.args.get("lat")
    longitude = request.args.get("lon")
    name = request.args.get("name", "Selected city").strip() or "Selected city"
    region = request.args.get("region", "").strip()

    if not latitude or not longitude:
        return jsonify({"error": "Latitude and longitude are required."}), 400

    try:
        payload = get_json(
            FORECAST_URL,
            {
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,weather_code,wind_speed_10m",
                "timezone": "auto",
            },
        )
    except requests.RequestException:
        return jsonify({"error": "Weather data is unavailable right now."}), 502

    current = payload.get("current") or {}
    code = current.get("weather_code")
    conditions = weather_for_code(code)

    return jsonify(
        {
            "city": name,
            "region": region,
            "temperature": current.get("temperature_2m"),
            "condition": conditions["label"],
            "icon": conditions["icon"],
            "wind_speed": current.get("wind_speed_10m"),
            "time": current.get("time"),
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
