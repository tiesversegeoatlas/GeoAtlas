from __future__ import annotations

from math import asin, atan2, cos, degrees, radians, sin, sqrt

EARTH_RADIUS_KM = 6371.0088


def validate_coordinates(latitude: float, longitude: float) -> bool:
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def haversine_distance(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    _require_coordinates(lat1, lon1)
    _require_coordinates(lat2, lon2)
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(radians, (lat1, lon1, lat2, lon2))
    delta_lat = lat2_rad - lat1_rad
    delta_lon = lon2_rad - lon1_rad
    value = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    )
    return round(2 * EARTH_RADIUS_KM * asin(min(1, sqrt(value))), 3)


def get_bounding_box(
    latitude: float,
    longitude: float,
    radius_km: float = 10,
) -> dict[str, float]:
    _require_coordinates(latitude, longitude)
    if radius_km < 0:
        raise ValueError("Radius must be non-negative.")
    angular_distance = radius_km / EARTH_RADIUS_KM
    latitude_rad = radians(latitude)
    min_lat = max(-90.0, degrees(latitude_rad - angular_distance))
    max_lat = min(90.0, degrees(latitude_rad + angular_distance))
    if min_lat <= -90 or max_lat >= 90:
        min_lon, max_lon = -180.0, 180.0
    else:
        longitude_delta = degrees(
            asin(min(1, sin(angular_distance) / max(abs(cos(latitude_rad)), 1e-12)))
        )
        min_lon = _normalize_longitude(longitude - longitude_delta)
        max_lon = _normalize_longitude(longitude + longitude_delta)
    return {
        "min_lat": round(min_lat, 6),
        "max_lat": round(max_lat, 6),
        "min_lon": round(min_lon, 6),
        "max_lon": round(max_lon, 6),
    }


def coordinates_to_geojson(latitude: float, longitude: float) -> dict:
    _require_coordinates(latitude, longitude)
    return {"type": "Point", "coordinates": [longitude, latitude]}


def midpoint_coordinates(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> dict[str, float]:
    _require_coordinates(lat1, lon1)
    _require_coordinates(lat2, lon2)
    lat1_rad, lon1_rad, lat2_rad, delta_lon = (
        radians(lat1),
        radians(lon1),
        radians(lat2),
        radians(lon2 - lon1),
    )
    x = cos(lat2_rad) * cos(delta_lon)
    y = cos(lat2_rad) * sin(delta_lon)
    latitude = atan2(
        sin(lat1_rad) + sin(lat2_rad),
        sqrt((cos(lat1_rad) + x) ** 2 + y**2),
    )
    longitude = lon1_rad + atan2(y, cos(lat1_rad) + x)
    return {
        "latitude": round(degrees(latitude), 6),
        "longitude": round(_normalize_longitude(degrees(longitude)), 6),
    }


def is_within_radius(
    center_lat: float,
    center_lon: float,
    point_lat: float,
    point_lon: float,
    radius_km: float,
) -> bool:
    if radius_km < 0:
        raise ValueError("Radius must be non-negative.")
    return haversine_distance(center_lat, center_lon, point_lat, point_lon) <= radius_km


def _require_coordinates(latitude: float, longitude: float) -> None:
    if not validate_coordinates(latitude, longitude):
        raise ValueError("Invalid coordinates provided.")


def _normalize_longitude(longitude: float) -> float:
    return (longitude + 180) % 360 - 180
