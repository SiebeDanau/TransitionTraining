"""Make the straight Maastricht/Liège TMA boundary topologically identical."""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAASTRICHT = ROOT / "data" / "airspaces" / "maastricht-tma" / "maastricht-tma-1.geojson"
LIEGE = (
    ROOT / "data" / "airspaces" / "liege-tma" / "liege-tma-1.geojson",
    ROOT / "data" / "airspaces" / "liege-tma" / "liege-tma-2.geojson",
)

# Published in Netherlands AIP ENR 2.1. GeoJSON order is longitude, latitude.
SOUTH_EAST = [5.74611111, 50.76972222]  # 504611N 0054446E
NORTH_WEST = [5.69611111, 50.79000000]  # 504724N 0054146E
CTR_NORTH = [5.76694444, 50.99888889]  # 505956N 0054601E
CTR_DE_NORTH = [5.87722222, 51.03361111]  # 510201N 0055238E
CTR_DE_SOUTH = [6.08500000, 50.91166667]  # 505442N 0060506E

# Parts of Maastricht TMA 1 situated in Brussels FIR, Belgium AIP ENR 2.1.
BE_PART_1_BORDER = [5.64916667, 50.82638889]  # 504935N 0053857E
BE_PART_1_INNER = [5.63750000, 50.81416667]  # 504851N 0053815E
BE_PART_2_BORDER = [5.99888889, 50.75361111]  # 504513N 0055956E
BE_PART_2_INNER = (
    [5.99888889, 50.75222222],  # 504508N 0055956E
    [5.91500000, 50.74972222],  # 504459N 0055454E
    [5.80666667, 50.75527778],  # 504519N 0054824E
)


def distance(a: list[float], b: list[float]) -> float:
    longitude_scale = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * longitude_scale, a[1] - b[1])


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ring(data: dict) -> list[list[float]]:
    return data["features"][0]["geometry"]["coordinates"][0]


def nearest_index(points: list[list[float]], target: list[float]) -> int:
    return min(range(len(points) - 1), key=lambda index: distance(points[index], target))


def segment_distance(start: list[float], end: list[float], target: list[float]) -> float:
    scale = math.cos(math.radians(target[1]))
    ax, ay = start[0] * scale, start[1]
    bx, by = end[0] * scale, end[1]
    px, py = target[0] * scale, target[1]
    dx, dy = bx - ax, by - ay
    factor = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + factor * dx), py - (ay + factor * dy))


def update_note(data: dict) -> None:
    properties = data["features"][0]["properties"]
    if properties.get("id") == "EHBK1":
        properties["aipSource"] = (
            "Netherlands AIP ENR 2.1 and Belgium & Luxembourg AIP ENR 2.1"
        )
        properties["belgianLateralLimits"] = (
            "Part 1: 504935N 0053857E - 504851N 0053815E - 504724N "
            "0054146E - along the Belgian-Dutch border - 504935N 0053857E. "
            "Part 2: 504611N 0054446E - along the Belgian-Dutch border - "
            "504513N 0055956E - 504508N 0055956E - 504459N 0055454E - "
            "504519N 0054824E - 504611N 0054446E."
        )
        properties["geometryNote"] = (
            "The complete Netherlands AIP outline is combined with both Maastricht "
            "TMA 1 parts published for Brussels FIR in Belgium AIP ENR 2.1. Border "
            "segments use shared detailed international-boundary coordinates."
        )
    properties["sharedBoundaryNote"] = (
        "The straight boundary 504611N 0054446E - 504724N 0054146E is stored "
        "with identical exact AIP endpoints in Maastricht TMA 1 and Liège TMA 1/2."
    )


def fix_maastricht() -> None:
    data = load(MAASTRICHT)
    points = ring(data)
    south_index = nearest_index(points, SOUTH_EAST)
    north_index = nearest_index(points, NORTH_WEST)
    if north_index != south_index + 1:
        raise RuntimeError("Maastricht shared-boundary vertices are not adjacent")
    if distance(points[south_index], SOUTH_EAST) > 0.001 or distance(points[north_index], NORTH_WEST) > 0.005:
        raise RuntimeError("Maastricht shared-boundary anchors were not found")
    points[south_index] = SOUTH_EAST
    points[north_index] = NORTH_WEST
    german_border_start = nearest_index(points, [6.08166667, 51.24611111])
    belgian_border_start = nearest_index(points, [6.02111111, 50.75416667])
    for target in (CTR_DE_NORTH, CTR_DE_SOUTH):
        if target not in points:
            insertion_after = min(
                range(german_border_start, belgian_border_start),
                key=lambda index: segment_distance(points[index], points[index + 1], target),
            )
            if segment_distance(points[insertion_after], points[insertion_after + 1], target) > 0.005:
                raise RuntimeError("Maastricht CTR German-border anchor is not on the TMA border path")
            points.insert(insertion_after + 1, target)
            belgian_border_start += 1
    if CTR_NORTH not in points:
        north_index = points.index(NORTH_WEST)
        insertion_after = min(
            range(north_index, len(points) - 1),
            key=lambda index: segment_distance(points[index], points[index + 1], CTR_NORTH),
        )
        if segment_distance(points[insertion_after], points[insertion_after + 1], CTR_NORTH) > 0.005:
            raise RuntimeError("Maastricht CTR northern border anchor is not on the TMA border path")
        points.insert(insertion_after + 1, CTR_NORTH)

    # Insert the exact Belgian border anchors, then replace only the portions where
    # the Belgian AIP sends the boundary into Brussels FIR instead of along the border.
    if BE_PART_2_BORDER not in points:
        south_index = points.index(SOUTH_EAST)
        belgian_border_start = nearest_index(points, [6.02111111, 50.75416667])
        insertion_after = min(
            range(belgian_border_start, south_index),
            key=lambda index: segment_distance(points[index], points[index + 1], BE_PART_2_BORDER),
        )
        if segment_distance(points[insertion_after], points[insertion_after + 1], BE_PART_2_BORDER) > 0.005:
            raise RuntimeError("Belgian Maastricht TMA part 2 border anchor was not found")
        points.insert(insertion_after + 1, BE_PART_2_BORDER)
    part_2_start, part_2_end = points.index(BE_PART_2_BORDER), points.index(SOUTH_EAST)
    expected_part_2 = [BE_PART_2_BORDER, *BE_PART_2_INNER, SOUTH_EAST]
    if points[part_2_start:part_2_end + 1] != expected_part_2:
        points[part_2_start:part_2_end + 1] = expected_part_2

    if BE_PART_1_BORDER not in points:
        north_index = points.index(NORTH_WEST)
        insertion_after = min(
            range(north_index, len(points) - 1),
            key=lambda index: segment_distance(points[index], points[index + 1], BE_PART_1_BORDER),
        )
        if segment_distance(points[insertion_after], points[insertion_after + 1], BE_PART_1_BORDER) > 0.005:
            raise RuntimeError("Belgian Maastricht TMA part 1 border anchor was not found")
        points.insert(insertion_after + 1, BE_PART_1_BORDER)
    part_1_start, part_1_end = points.index(NORTH_WEST), points.index(BE_PART_1_BORDER)
    expected_part_1 = [NORTH_WEST, BE_PART_1_INNER, BE_PART_1_BORDER]
    if points[part_1_start:part_1_end + 1] != expected_part_1:
        points[part_1_start:part_1_end + 1] = expected_part_1
    update_note(data)
    save(MAASTRICHT, data)


def fix_liege(path: Path) -> None:
    data = load(path)
    points = ring(data)
    south_index = nearest_index(points, SOUTH_EAST)
    if distance(points[south_index], SOUTH_EAST) > 0.000001:
        raise RuntimeError(f"Exact Liège south-east anchor not found in {path.name}")
    previous = points[south_index - 1]
    if distance(previous, NORTH_WEST) > 0.000001:
        points.insert(south_index, NORTH_WEST)
    update_note(data)
    save(path, data)


def assert_shared_edge() -> None:
    maastricht = ring(load(MAASTRICHT))
    maastricht_index = next(index for index, value in enumerate(maastricht) if value == SOUTH_EAST)
    expected = [SOUTH_EAST, NORTH_WEST]
    if maastricht[maastricht_index:maastricht_index + 2] != expected:
        raise RuntimeError("Maastricht does not contain the exact shared edge")
    de_north = maastricht.index(CTR_DE_NORTH)
    de_south = maastricht.index(CTR_DE_SOUTH)
    if de_south <= de_north:
        raise RuntimeError("Maastricht German-border anchors have unexpected order")
    part_1 = maastricht.index(NORTH_WEST)
    if maastricht[part_1:part_1 + 3] != [NORTH_WEST, BE_PART_1_INNER, BE_PART_1_BORDER]:
        raise RuntimeError("Belgian Maastricht TMA part 1 is not exact")
    part_2 = maastricht.index(BE_PART_2_BORDER)
    if maastricht[part_2:part_2 + 5] != [BE_PART_2_BORDER, *BE_PART_2_INNER, SOUTH_EAST]:
        raise RuntimeError("Belgian Maastricht TMA part 2 is not exact")
    for path in LIEGE:
        points = ring(load(path))
        liege_index = next(index for index, value in enumerate(points) if value == NORTH_WEST)
        if points[liege_index:liege_index + 2] != [NORTH_WEST, SOUTH_EAST]:
            raise RuntimeError(f"{path.name} does not contain the reversed shared edge")


def main() -> None:
    fix_maastricht()
    for path in LIEGE:
        fix_liege(path)
    assert_shared_edge()
    print("Shared Maastricht/Liège TMA boundary is exact and topologically identical.")


if __name__ == "__main__":
    main()
