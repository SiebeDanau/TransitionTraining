"""Expand AIP 'along border/coastline' polygon edges with official GISCO geometry."""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import urllib.request
from pathlib import Path


GISCO_URL = "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2024_4326.geojson"
COORD = re.compile(r"(\d{6})\s*([NS])\s*(\d{7})\s*([EW])", re.IGNORECASE)
TARGETS = (
    "data/airspaces/navigation-warnings/military-exercise-training-areas.geojson",
    "data/airspaces/navigation-warnings/aerial-sporting-recreational-areas.geojson",
)


def decimal(dms: str, hemisphere: str) -> float:
    degree_digits = len(dms) - 4
    value = int(dms[:degree_digits]) + int(dms[degree_digits:degree_digits + 2]) / 60 + int(dms[-2:]) / 3600
    return -value if hemisphere.upper() in "SW" else value


def coordinate(match: re.Match[str]) -> list[float]:
    return [decimal(match.group(3), match.group(4)), decimal(match.group(1), match.group(2))]


def distance(a: list[float], b: list[float]) -> float:
    longitude_scale = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * longitude_scale, a[1] - b[1])


def path_length(points: list[list[float]]) -> float:
    return sum(distance(a, b) for a, b in zip(points, points[1:]))


def boundary_path(ring: list[list[float]], start: list[float], end: list[float]) -> list[list[float]]:
    vertices = ring[:-1] if ring[0] == ring[-1] else ring
    start_index = min(range(len(vertices)), key=lambda index: distance(vertices[index], start))
    end_index = min(range(len(vertices)), key=lambda index: distance(vertices[index], end))

    def walk(step: int) -> list[list[float]]:
        result, index = [], start_index
        while index != end_index:
            result.append(vertices[index])
            index = (index + step) % len(vertices)
        result.append(vertices[end_index])
        return result

    selected = min((walk(1), walk(-1)), key=path_length)
    return [start, *selected[1:-1], end]


def boundary_country(description: str) -> str | None:
    normalized = re.sub(r"[^a-z]+", " ", description.lower())
    if "coastline" in normalized:
        return "BE"
    if "border" not in normalized:
        return None
    countries = {
        "belg": "BE", "german": "DE", "france": "FR", "french": "FR",
        "dutch": "NL", "netherland": "NL", "luxembourg": "LU",
    }
    found = {code for word, code in countries.items() if word in normalized}
    if "LU" in found:
        return "LU"
    if "BE" in found:
        return "BE"
    return None


def prescribed_segments(text: str) -> list[tuple[list[float], list[float], str]]:
    matches = list(COORD.finditer(text or ""))
    result = []
    for first, second in zip(matches, matches[1:]):
        description = text[first.end():second.start()]
        country = boundary_country(description)
        if country:
            result.append((coordinate(first), coordinate(second), country))
    return result


def main_ring(feature: dict) -> list[list[float]] | None:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "Polygon" or not geometry.get("coordinates"):
        return None
    return geometry["coordinates"][0]


def anchor_index(ring: list[list[float]], anchor: list[float]) -> int:
    candidates=range(len(ring)-1)
    exact=next((index for index in candidates if distance(ring[index],anchor)<1e-9),None)
    return exact if exact is not None else min(range(len(ring)-1),key=lambda index:distance(ring[index],anchor))


def expand_feature(feature: dict, boundaries: dict[str, list[list[float]]]) -> tuple[int, list[str]]:
    ring = main_ring(feature)
    segments = prescribed_segments(feature.get("properties", {}).get("lateralLimits", ""))
    if not ring or not segments:
        return 0, []

    working = ring[:-1]
    failures = []
    replacements = 0
    for start, end, country in segments:
        start_index, end_index = anchor_index([*working, working[0]], start), anchor_index([*working, working[0]], end)
        start_distance, end_distance = distance(working[start_index], start), distance(working[end_index], end)
        if start_distance > 0.0003 or end_distance > 0.0003:
            failures.append(f"published anchor not found in polygon ({start_distance:.6f}, {end_distance:.6f})")
            continue
        if end_index != (start_index + 1) % len(working):
            failures.append("border anchors are not one straight polygon edge in source data")
            continue
        working[start_index],working[end_index]=start,end
        expanded = boundary_path(boundaries[country], start, end)
        if end_index == 0:
            working = [*working, *expanded[1:-1]]
        else:
            working = [*working[:start_index], *expanded[:-1], *working[end_index:]]
        replacements += 1

    if replacements:
        feature["geometry"]["coordinates"][0] = [*working, working[0]]
        properties = feature["properties"]
        properties["geometryNote"] = "Published AIP anchor points expanded along applicable national borders/coastline using full Eurostat GISCO 2024 1:1M boundary geometry."
    return replacements, failures


def load_boundaries(cache: Path) -> dict[str, list[list[float]]]:
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(GISCO_URL) as response:
            cache.write_bytes(response.read())
    collection = json.loads(cache.read_text(encoding="utf-8"))
    wanted = {"BE", "LU"}
    result = {}
    for feature in collection["features"]:
        country = feature["properties"].get("CNTR_ID")
        if country in wanted:
            result[country] = feature["geometry"]["coordinates"][0][0]
    if result.keys() != wanted:
        raise RuntimeError(f"GISCO boundaries missing: {sorted(wanted - result.keys())}")
    return result


def run(root: Path, cache: Path, from_git_head: bool = False) -> dict:
    boundaries = load_boundaries(cache)
    report = {"files": {}, "failures": []}
    for relative in TARGETS:
        path = root / relative
        if from_git_head:
            source = subprocess.check_output(["git", "show", f"HEAD:{relative}"], cwd=root).decode("utf-8")
        else:
            source = path.read_text(encoding="utf-8")
        data = json.loads(source)
        changed_features = changed_segments = 0
        for feature in data.get("features", []):
            replacements, failures = expand_feature(feature, boundaries)
            if replacements:
                changed_features += 1
                changed_segments += replacements
            if failures:
                report["failures"].append({"id": feature.get("properties", {}).get("id"), "issues": failures})
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report["files"][relative] = {"features": changed_features, "segments": changed_segments}
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--cache", type=Path, default=Path(__file__).resolve().parents[1] / "tmp" / "gisco-countries-2024.geojson")
    parser.add_argument("--from-git-head", action="store_true", help="Regenerate from the committed source data")
    arguments = parser.parse_args()
    result = run(arguments.root, arguments.cache, arguments.from_git_head)
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["failures"] else 0)
