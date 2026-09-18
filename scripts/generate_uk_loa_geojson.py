"""Generate UK LoA map envelopes from UK AIP ENR 2.1, AIRAC 09/2026."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "data/airspaces/loa"
SOURCE_URL = "https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-09-03-AIRAC/html/eAIP/EG-ENR-2.1-en-GB.html"


def decimal(value):
    digits, hemisphere = value[:-1], value[-1]
    degrees = len(digits) - 4
    result = int(digits[:degrees]) + int(digits[degrees:degrees + 2]) / 60 + int(digits[-2:]) / 3600
    return -result if hemisphere in "SW" else result


def main():
    records = json.loads((DIRECTORY / "uk-source.json").read_text(encoding="utf-8-sig"))
    definitions = {record["name"]: record["definition"] for record in records}
    features = []
    for name, definition in definitions.items():
        lateral = definition[len(name):].split("Upper limit:")[0].strip()
        geometry_definition = definitions["LONDON FIR"] if name == "LONDON UIR" else definition
        pairs = re.findall(r"(\d{6}N)\s+(\d{7}[EW])", geometry_definition.split("Upper limit:")[0])
        ring = [[decimal(lon), decimal(lat)] for lat, lon in pairs]
        assert len(ring) >= 4 and ring[0] == ring[-1], name
        # GeoJSON exterior rings use counter-clockwise winding.
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
        if area < 0:
            ring.reverse()
        limits = re.search(r"Upper limit: (.*?) Lower limit: (.*?) Class: ([A-G])", definition)
        upper, lower, airspace_class = limits.groups()
        group = "FIR / UIR" if name in ("LONDON FIR", "LONDON UIR") else "Clacton CTA" if name.startswith("CLACTON") else "Worthing CTA" if name.startswith("WORTHING") else "Upper control areas"
        remarks = ""
        if name == "LONDON FIR":
            lower = "SFC"
            airspace_class = "G (SFC–FL 195); C (FL 195–245)"
            remarks = "FIR background classification; separately designated controlled airspace retains its published class."
        if name == "LONDON UIR":
            remarks = "Same lateral limits as London FIR. RVSM airspace: FL 290–410 inclusive."
        features.append({
            "type": "Feature",
            "properties": {
                "id": name.replace(" ", "-"), "name": name,
                "loaPartner": "UK", "parentGroup": group,
                "lowerLimit": lower, "upperLimit": upper, "airspaceClass": airspace_class,
                "controlUnit": "London ACC / Scottish ACC" if name in ("LONDON FIR", "LONDON UIR", "UPPER AIRSPACE CTA") else "London ACC / London Control",
                "hours": "H24", "remarks": remarks,
                "lateralLimits": lateral,
                "geometryNote": "Full published lateral envelope; adjoining Brussels FIR on 0020000E between 510700N and 513000N. Straight coordinate segments and specified parallels retained. LoA grouping does not define coordination procedures.",
                "aipSource": "UK AIP ENR 2.1, AIRAC 09/2026, effective 03 SEP 2026",
                "aipSourceUrl": SOURCE_URL, "effectiveDate": "2026-09-03",
            },
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
    output = {"type": "FeatureCollection", "name": "LoA — UK", "features": features}
    (DIRECTORY / "uk.geojson").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(features)} UK airspaces")


if __name__ == "__main__":
    main()
