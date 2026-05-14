from __future__ import annotations

import pytest

from app import app, weather_for_code


@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    return app.test_client()


def test_weather_code_mapping_known_conditions():
    assert weather_for_code(0) == {"label": "Clear sky", "icon": "sun"}
    assert weather_for_code(45) == {"label": "Fog", "icon": "fog"}
    assert weather_for_code(61) == {"label": "Slight rain", "icon": "cloud-rain"}
    assert weather_for_code(80) == {"label": "Slight rain showers", "icon": "cloud-rain"}
    assert weather_for_code(95) == {"label": "Thunderstorm", "icon": "cloud-lightning"}


def test_weather_code_mapping_unknown_condition():
    assert weather_for_code(999) == {
        "label": "Unknown conditions",
        "icon": "cloud-question",
    }


def test_cities_empty_query_returns_empty_list(client):
    response = client.get("/api/cities?q=")
    assert response.status_code == 200
    assert response.get_json() == {"cities": []}


def test_cities_filters_to_australia(client, monkeypatch):
    def fake_get_json(url, params):
        return {
            "results": [
                {
                    "name": "Canberra",
                    "admin1": "Australian Capital Territory",
                    "latitude": -35.28,
                    "longitude": 149.13,
                    "country_code": "AU",
                },
                {
                    "name": "Canberra",
                    "admin1": "Somewhere Else",
                    "latitude": 1,
                    "longitude": 2,
                    "country_code": "ZZ",
                },
            ]
        }

    monkeypatch.setattr("app.get_json", fake_get_json)
    response = client.get("/api/cities?q=can")
    assert response.status_code == 200
    assert response.get_json()["cities"] == [
        {
            "name": "Canberra",
            "region": "Australian Capital Territory",
            "latitude": -35.28,
            "longitude": 149.13,
        }
    ]


def test_weather_requires_coordinates(client):
    response = client.get("/api/weather")
    assert response.status_code == 400
    assert response.get_json()["error"] == "Latitude and longitude are required."


def test_weather_returns_normalized_payload(client, monkeypatch):
    def fake_get_json(url, params):
        return {
            "current": {
                "temperature_2m": 18.6,
                "weather_code": 2,
                "wind_speed_10m": 12.4,
                "time": "2026-05-14T14:00",
            }
        }

    monkeypatch.setattr("app.get_json", fake_get_json)
    response = client.get(
        "/api/weather?lat=-35.28&lon=149.13&name=Canberra&region=ACT"
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "city": "Canberra",
        "region": "ACT",
        "temperature": 18.6,
        "condition": "Partly cloudy",
        "icon": "cloud-sun",
        "wind_speed": 12.4,
        "time": "2026-05-14T14:00",
    }
