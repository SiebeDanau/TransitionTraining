"""Generate CTR GeoJSON from the published AIP coordinate descriptions."""

from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "airspaces" / "ctr" / "ctr.geojson"
MAASTRICHT_TMA = ROOT / "data" / "airspaces" / "maastricht-tma" / "maastricht-tma-1.geojson"
BRUSSELS_UIR = ROOT / "data" / "airspaces" / "brussels-uir.geojson"
NM_KM = 1.852
EARTH_KM = 6371.0088


def point(value: str) -> list[float]:
    lat, lon = value.split()

    def decimal(dms: str) -> float:
        hemi = dms[-1]
        digits = dms[:-1]
        degree_digits = 2 if hemi in "NS" else 3
        result = int(digits[:degree_digits]) + int(digits[degree_digits:degree_digits + 2]) / 60 + float(digits[degree_digits + 2:]) / 3600
        return -result if hemi in "SW" else result

    return [decimal(lon), decimal(lat)]


def bearing(center: list[float], target: list[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, [center[0], center[1], target[0], target[1]])
    return (math.degrees(math.atan2(math.sin(lon2 - lon1) * math.cos(lat2), math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1))) + 360) % 360


def destination(center: list[float], bearing_degrees: float, radius_nm: float) -> list[float]:
    lon1, lat1 = map(math.radians, center)
    course = math.radians(bearing_degrees)
    distance = radius_nm * NM_KM / EARTH_KM
    lat2 = math.asin(math.sin(lat1) * math.cos(distance) + math.cos(lat1) * math.sin(distance) * math.cos(course))
    lon2 = lon1 + math.atan2(math.sin(course) * math.sin(distance) * math.cos(lat1), math.cos(distance) - math.sin(lat1) * math.sin(lat2))
    return [round(math.degrees(lon2), 8), round(math.degrees(lat2), 8)]


def arc(start: str, center: str, end: str, radius_nm: float, clockwise: bool = True) -> list[list[float]]:
    start_point, center_point, end_point = point(start), point(center), point(end)
    first, last = bearing(center_point, start_point), bearing(center_point, end_point)
    sweep = (last - first) % 360 if clockwise else -((first - last) % 360)
    steps = max(2, math.ceil(abs(sweep)))
    values = [start_point]
    values.extend(destination(center_point, first + sweep * index / steps, radius_nm) for index in range(1, steps))
    values.append(end_point)
    return values


def p(*values: str) -> list[list[float]]:
    return [point(value) for value in values]


def maastricht_border_path() -> list[list[float]]:
    """Reuse the exact detailed Dutch-Belgian border from Maastricht TMA 1."""
    collection = json.loads(MAASTRICHT_TMA.read_text(encoding="utf-8"))
    ring = collection["features"][0]["geometry"]["coordinates"][0]
    start, end = point("504724N 0054146E"), point("505956N 0054601E")

    def exact_index(target: list[float]) -> int:
        matches = [
            index for index, value in enumerate(ring)
            if abs(value[0] - target[0]) < 1e-7 and abs(value[1] - target[1]) < 1e-7
        ]
        if not matches:
            raise RuntimeError(f"Shared Maastricht border anchor missing: {target}")
        return matches[0]

    first, last = exact_index(start), exact_index(end)
    if last <= first:
        raise RuntimeError("Shared Maastricht CTR border path has unexpected direction")
    return ring[first:last + 1]


def maastricht_german_border_path() -> list[list[float]]:
    """Reuse the exact detailed Dutch-German border from Maastricht TMA 1."""
    collection = json.loads(MAASTRICHT_TMA.read_text(encoding="utf-8"))
    ring = collection["features"][0]["geometry"]["coordinates"][0]
    start = [5.87722222, 51.03361111]
    end = [6.085, 50.91166667]
    first, last = ring.index(start), ring.index(end)
    if last <= first:
        raise RuntimeError("Shared Maastricht German-border path has unexpected direction")
    return ring[first:last + 1]


def path_length(points: list[list[float]]) -> float:
    return sum(
        math.hypot((b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2)), b[1] - a[1])
        for a, b in zip(points, points[1:])
    )


def kleine_brogel_border_path() -> list[list[float]]:
    """Return one shared detailed Belgian-Dutch border for both EBBL CTRs."""
    collection = json.loads(BRUSSELS_UIR.read_text(encoding="utf-8"))
    ring = collection["features"][0]["geometry"]["coordinates"][0]
    vertices = ring[:-1] if ring[0] == ring[-1] else ring
    start = point("511052N 0054231E")
    end = point("511743N 0053057E")

    def nearest(target: list[float]) -> int:
        return min(
            range(len(vertices)),
            key=lambda index: math.hypot(
                (vertices[index][0] - target[0]) * math.cos(math.radians(target[1])),
                vertices[index][1] - target[1],
            ),
        )

    first, last = nearest(start), nearest(end)

    def walk(step: int) -> list[list[float]]:
        result, index = [], first
        while index != last:
            result.append(vertices[index])
            index = (index + step) % len(vertices)
        result.append(vertices[last])
        return result

    selected = min((walk(1), walk(-1)), key=path_length)
    return [start, *selected[1:-1], end]


def feature(identifier: str, name: str, category: str, upper: str, airspace_class: str, control_unit: str, hours: str, lateral: str, coordinates: list[list[float]], source: str, remarks: str = "", parent_group: str = "") -> dict:
    ring = [coordinates[0]]
    ring.extend(value for value in coordinates[1:] if value != ring[-1])
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    properties = {
        "id": identifier,
        "name": name,
        "category": category,
        "lowerLimit": "GND",
        "upperLimit": upper,
        "airspaceClass": airspace_class,
        "controlUnit": control_unit,
        "hours": hours,
        "lateralLimits": lateral,
        "aipSource": source,
        "geometryNote": "Published AIP points retained exactly; circular arcs sampled geodesically at no more than one degree.",
    }
    if remarks:
        properties["remarks"] = remarks
    if parent_group:
        properties["parentGroup"] = parent_group
    return {"type": "Feature", "properties": properties, "geometry": {"type": "Polygon", "coordinates": [ring]}}


def main() -> None:
    data = [
        feature("EBAW-CTR", "Antwerpen CTR", "Civil", "2500FT AMSL", "D", "Antwerpen Tower", "As AD Operator", "511606N 0041600E - 511606N 0043737E - 511005N 0044746E - 510432N 0041845E - clockwise arc radius 8 NM centred at 511107N 0042600E to 511606N 0041600E.", p("511606N 0041600E", "511606N 0043737E", "511005N 0044746E", "510432N 0041845E") + arc("510432N 0041845E", "511107N 0042600E", "511606N 0041600E", 8), "Belgium & Luxembourg AIP EBAW AD 2.17, AMDT 008/2026"),
        feature("EBBR-CTR", "Brussels CTR", "Civil", "1500FT AMSL", "D", "Brussels Tower", "H24", "504434N 0043404E - clockwise arc radius 10 NM centred at 505405N 0042904E to 505203N 0044435E - 504434N 0043404E.", arc("504434N 0043404E", "505405N 0042904E", "505203N 0044435E", 10) + p("504434N 0043404E"), "Belgium & Luxembourg AIP EBBR AD 2.17, AMDT 008/2026", "Partially class G during EBGB operational hours as specified in the AIP."),
        feature("EBCI-CTR", "Charleroi CTR", "Civil", "2500FT AMSL", "D", "Charleroi Tower", "As ATS operational hours", "503339N 0043136E - clockwise arc radius 5.5 NM centred at 502817N 0043335E to 502255N 0043533E - 502010N 0041725E - clockwise arc radius 5.5 NM centred at 502532N 0041525E to 503054N 0041324E - 503339N 0043136E.", arc("503339N 0043136E", "502817N 0043335E", "502255N 0043533E", 5.5) + p("502010N 0041725E") + arc("502010N 0041725E", "502532N 0041525E", "503054N 0041324E", 5.5) + p("503339N 0043136E"), "Belgium & Luxembourg AIP EBCI AD 2.17, AMDT 008/2026"),
        feature("EBLG-CTR", "Liège CTR", "Civil", "2500FT AMSL", "D", "Liège Tower", "H24", "504512N 0052633E - clockwise arc radius 5 NM centred at 504137N 0053205E to 503802N 0053736E - 503113N 0052641E - clockwise arc radius 5 NM centred at 503447N 0052110E to 503821N 0051538E - 504512N 0052633E.", arc("504512N 0052633E", "504137N 0053205E", "503802N 0053736E", 5) + p("503113N 0052641E") + arc("503113N 0052641E", "503447N 0052110E", "503821N 0051538E", 5) + p("504512N 0052633E"), "Belgium & Luxembourg AIP EBLG AD 2.17, AMDT 008/2026"),
        feature("ELLX-CTR", "Luxembourg CTR", "Civil", "2500FT AMSL", "D", "Luxembourg Tower", "H24", "494311N 0061213E - clockwise arc radius 5 NM centred at 493850N 0061603E to 493429N 0061952E - 493041N 0060939E - clockwise arc radius 5 NM centred at 493502N 0060549E to 493923N 0060159E - 494311N 0061213E.", arc("494311N 0061213E", "493850N 0061603E", "493429N 0061952E", 5) + p("493041N 0060939E") + arc("493041N 0060939E", "493502N 0060549E", "493923N 0060159E", 5) + p("494311N 0061213E"), "Belgium & Luxembourg AIP ELLX AD 2.17, AMDT 008/2026"),
        feature("EHBK-CTR", "Maastricht CTR", "Civil", "3000FT AMSL", "C", "Beek Tower", "0500-2300 (0400-2200)", "510201N 0055238E - Dutch-German border - 505442N 0060506E - 505445N 0055840E - 505125N 0055513E - clockwise arc radius 6.5 NM centred at 505457N 0054637E to 504829N 0054538E - 504637N 0054343E - 504724N 0054146E - Dutch-Belgian border - 505956N 0054601E - 510317N 0054932E - 510201N 0055238E.", maastricht_german_border_path() + p("505445N 0055840E", "505125N 0055513E") + arc("505125N 0055513E", "505457N 0054637E", "504829N 0054538E", 6.5) + p("504637N 0054343E") + maastricht_border_path() + p("510317N 0054932E", "510201N 0055238E"), "Netherlands AIP EHBK AD 2.17, AIRAC AMDT 08/2026", "The Dutch-German and northern Dutch-Belgian border segments reuse the identical detailed boundary paths from Maastricht TMA 1. Parts outside Amsterdam FIR are subject to the German and Belgian AIPs."),
        feature("EBOS-CTR", "Oostende CTR", "Civil", "1500FT AMSL", "D", "Oostende Tower", "H24", "511412N 0030716E - clockwise arc radius 5 NM centred at 511305N 0025929E to 510812N 0030119E - 510635N 0025022E - 511145N 0023423E - counterclockwise arc radius 5 NM centred at 510717N 0023045E to 511124N 0022612E - 511935N 0024500E - 512018N 0025304E - clockwise arc radius 8 NM centred at 511221N 0025450E to 511412N 0030716E.", arc("511412N 0030716E", "511305N 0025929E", "510812N 0030119E", 5) + p("510635N 0025022E", "511145N 0023423E") + arc("511145N 0023423E", "510717N 0023045E", "511124N 0022612E", 5, False) + p("511935N 0024500E", "512018N 0025304E") + arc("512018N 0025304E", "511221N 0025450E", "511412N 0030716E", 8), "Belgium & Luxembourg AIP EBOS AD 2.17, AMDT 008/2026"),
        feature("EBBE-CTR", "Beauvechain CTR", "Military", "2500FT AMSL", "D", "Beauvechain Tower", "As ATS operational hours", "504151N 0043016E - 505718N 0045201E - 505356N 0050240E - clockwise arc radius 7.7 NM centred at 504654N 0045728E to 504836N 0050925E - 504157N 0045525E - 503941N 0044955E - 503502N 0044248E - clockwise arc radius 10.6 NM centred at 504528N 0044601E to 504151N 0043016E.", p("504151N 0043016E", "505718N 0045201E", "505356N 0050240E") + arc("505356N 0050240E", "504654N 0045728E", "504836N 0050925E", 7.7) + p("504157N 0045525E", "503941N 0044955E", "503502N 0044248E") + arc("503502N 0044248E", "504528N 0044601E", "504151N 0043016E", 10.6), "Belgium & Luxembourg AIP EBBE AD 2.17, AMDT 008/2026"),
        feature("EBCV-CTR", "Chièvres CTR", "Military", "2500FT AMSL", "D", "Chièvres Tower", "As ATS operational hours", "503454N 0034046E - clockwise arc radius 6 NM centred at 503436N 0035012E to 503652N 0034127E - 503808N 0034737E - 504036N 0040415E - clockwise arc radius 6 NM centred at 503532N 0035910E to 503205N 0040655E - 503039N 0040151E - 502920N 0034840E - 503059N 0034410E - 503454N 0034046E.", arc("503454N 0034046E", "503436N 0035012E", "503652N 0034127E", 6) + p("503808N 0034737E", "504036N 0040415E") + arc("504036N 0040415E", "503532N 0035910E", "503205N 0040655E", 6) + p("503039N 0040151E", "502920N 0034840E", "503059N 0034410E", "503454N 0034046E"), "Belgium & Luxembourg AIP EBCV AD 2.17, AMDT 008/2026", "Operated by USAF."),
        feature("EBFS-CTR", "Florennes CTR", "Military", "3500FT AMSL", "D", "Florennes Tower", "As ATS operational hours", "501816N 0044404E - 501918N 0045328E - 501320N 0045527E - 501218N 0044540E - clockwise arc radius 5 NM centred at 501436N 0043845E to 501059N 0043322E - 500957N 0042355E - 501547N 0042210E - 501653N 0043149E - clockwise arc radius 5 NM centred at 501436N 0043845E to 501816N 0044404E.", p("501816N 0044404E", "501918N 0045328E", "501320N 0045527E", "501218N 0044540E") + arc("501218N 0044540E", "501436N 0043845E", "501059N 0043322E", 5) + p("500957N 0042355E", "501547N 0042210E", "501653N 0043149E") + arc("501653N 0043149E", "501436N 0043845E", "501816N 0044404E", 5), "Belgium & Luxembourg AIP EBFS AD 2.17, AMDT 008/2026"),
        feature("EBBL-CTR-1", "Kleine-Brogel CTR One", "Military", "2500FT AMSL", "D", "Kleine-Brogel Tower", "As ATS operational hours", "511052N 0054231E - Belgian-Dutch border - 511743N 0053057E - 510810N 0051238E - counterclockwise arc radius 5 NM centred at 510445N 0051827E to 510120N 0052414E - 511052N 0054231E.", kleine_brogel_border_path() + p("510810N 0051238E") + arc("510810N 0051238E", "510445N 0051827E", "510120N 0052414E", 5, False) + p("511052N 0054231E"), "Belgium & Luxembourg AIP EBBL AD 2.17, AMDT 008/2026", "The Belgian-Dutch segment uses the shared detailed national boundary. EBR05A is excluded when activated.", "Kleine-Brogel CTR"),
        feature("EBBL-CTR-2", "Kleine-Brogel CTR Two", "Military", "3000FT AMSL", "D", "Kleine-Brogel Tower", "HO", "511743N 0053057E - clockwise arc radius 5 NM centred at 511421N 0053650E to 511052N 0054231E - Belgian-Dutch border - 511743N 0053057E.", arc("511743N 0053057E", "511421N 0053650E", "511052N 0054231E", 5) + kleine_brogel_border_path(), "Belgium & Luxembourg AIP ENR 2.2, AMDT 008/2026", "The Belgian-Dutch segment uses the same detailed national boundary as CTR One. ATZ and AFIZ Budel excluded when active.", "Kleine-Brogel CTR"),
        feature("EBFN-CTR", "Koksijde CTR", "Military", "FL055", "D", "Koksijde Tower", "As ATS operational hours", "510227N 0022840E - clockwise arc radius 5 NM centred at 510717N 0023045E to 511145N 0023423E - 510357N 0025825E - 505900N 0024917E - 510227N 0022840E.", arc("510227N 0022840E", "510717N 0023045E", "511145N 0023423E", 5) + p("510357N 0025825E", "505900N 0024917E", "510227N 0022840E"), "Belgium & Luxembourg AIP EBFN AD 2.17, AMDT 008/2026", "Partially situated in France; the LFAK exclusion and delegated ATS conditions remain as published in the AIP."),
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"type": "FeatureCollection", "name": "Control Zones", "features": data}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
