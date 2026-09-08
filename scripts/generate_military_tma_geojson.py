"""Generate Belgian military TMAs from AIP ENR 2.1, effective 03 SEP 2026.

Run from any directory with Python 3; no third-party packages are required.
Borders reuse the detailed boundary already used by Brussels UIR. Conditional
activation/exclusions and vertical extensions are metadata, not live NOTAM state.
"""

import json
import re

from generate_ctr_geojson import ROOT, arc, point
from update_border_geometries import boundary_path

SOURCE_URL = "https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/html/eAIP/EB-ENR-2.1-en-GB.html"
COORD = r"\d{6}N \d{7}E"
ARC = re.compile(r"an arc of circle, ([\d.]+) NM radius, centred on (" + COORD + r") and traced (counterclockwise|clockwise) to (" + COORD + r")")

# Published lateral limits, with whitespace normalized. Arc centers are not vertices.
AREAS = [
    ("beauvechain", "1a", "ONE A", "2500FT AMSL", "3500FT AMSL",
     "503823N 0042917E - 504048N 0043801E - 505345N 0045425E - 510216N 0050508E - 510122N 0051316E - an arc of circle, 40 NM radius, centred on 510954N 0041102E and traced clockwise to 503810N 0044949E - 503640N 0045629E - 503053N 0045743E - 502900N 0045106E - 503018N 0045049E - an arc of circle, 5.5 NM radius, centred on 502932N 0044215E and traced counterclockwise to 503502N 0044248E - 503823N 0042917E."),
    ("beauvechain", "1b", "ONE B", "3500FT AMSL", "4500FT AMSL",
     "504048N 0043801E - 505345N 0045425E - 505107N 0050712E - an arc of circle, 40 NM radius, centred on 510954N 0041102E and traced clockwise to 503810N 0044949E - 504048N 0043801E."),
    ("beauvechain", "2", "TWO", "2500FT AMSL", "3500FT AMSL",
     "504111N 0042920E - 505500N 0044845E - 505345N 0045425E - 504048N 0043801E - 503823N 0042917E - 504111N 0042920E."),
    ("beauvechain", "3", "THREE", "2500FT AMSL", "4500FT AMSL",
     "503053N 0045743E - 503640N 0045629E - 503810N 0044949E - an arc of circle, 40 NM radius, centred on 510954N 0041102E and traced counterclockwise to 510122N 0051316E - 505533N 0051951E - 505530N 0052754E - 505223N 0053408E - 505150N 0052933E - 504817N 0051953E - 503814N 0050408E - 503316N 0050607E - 503053N 0045743E."),
    ("beauvechain", "4", "FOUR", "2500FT AMSL", "4500FT AMSL",
     "502900N 0045106E - 503316N 0050607E - 503101N 0050701E - an arc of circle, 6.5 NM radius, centred on 502912N 0051650E and traced counterclockwise to 502451N 0050914E - 502300N 0050943E - 502205N 0050105E - an arc of circle, 8 NM radius, centred on 501521N 0045417E and traced counterclockwise to 502316N 0045220E - 502900N 0045106E."),
    ("florennes", "", "", "2500FT AMSL", "4500FT AMSL",
     "501704N 0041035E - 501842N 0041627E - 502316N 0045220E - an arc of circle, 8 NM radius, centred on 501521N 0045417E and traced clockwise to 500728N 0045635E - 500656N 0045209E - along the Belgian-French border - 500545N 0044211E - 500206N 0040902E - along the Belgian-French border - 501704N 0041035E."),
    ("kleine-brogel", "1", "ONE", "2500FT AMSL", "4500FT AMSL",
     "510251N 0045955E - 510634N 0045955E - 511551N 0051647E - along the Belgian-Dutch border - 510805N 0055036E - 510607N 0053455E - 510723N 0053455E - 510557N 0052255E - 510452N 0051951E - 505929N 0051951E - 510057N 0051655E - 510251N 0045955E."),
    ("kleine-brogel", "2", "TWO", "2500FT AMSL", "4500FT AMSL",
     "510805N 0055036E - along the Belgian-Dutch border - 510333N 0054619E - 510157N 0053455E - 505929N 0051951E - 510452N 0051951E - 510557N 0052255E - 510723N 0053455E - 510607N 0053455E - 510805N 0055036E."),
    ("kleine-brogel", "3", "THREE", "2500FT AMSL", "4500FT AMSL",
     "510333N 0054619E - along the Belgian-Dutch border - 505655N 0054502E - 505528N 0053207E - 505533N 0051951E - 510122N 0051316E - 510057N 0051655E - 505929N 0051951E - 510157N 0053455E - 510333N 0054619E."),
]


def geometry(lateral, border):
    tokens = lateral.rstrip(".").split(" - ")
    ring, previous = [], None
    follow_border = False
    for token in tokens:
        if token.startswith("along the "):
            if previous is None or follow_border:
                raise ValueError(f"Unexpected border instruction: {token}")
            follow_border = True
            continue
        match = ARC.fullmatch(token)
        if match:
            radius, center, direction, end = match.groups()
            if previous is None or follow_border:
                raise ValueError(f"Unexpected arc instruction: {token}")
            ring.extend(arc(previous, center, end, float(radius), direction == "clockwise")[1:])
            previous = end
        elif re.fullmatch(COORD, token):
            if follow_border:
                ring.extend(boundary_path(border, point(previous), point(token))[1:])
                follow_border = False
            else:
                ring.append(point(token))
            previous = token
        else:
            raise ValueError(f"Unrecognized boundary instruction: {token}")
    if follow_border or ring[0] != ring[-1]:
        raise ValueError("Boundary is not closed")
    # RFC 7946 exterior rings run counterclockwise.
    if sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])) < 0:
        ring.reverse()
    return {"type": "Polygon", "coordinates": [ring]}


def main():
    border = json.loads((ROOT / "data/airspaces/brussels-uir.geojson").read_text(encoding="utf-8"))["features"][0]["geometry"]["coordinates"][0]
    for base, number, suffix, lower, upper, lateral in AREAS:
        airport = {"beauvechain": "EBBE", "florennes": "EBFS", "kleine-brogel": "EBBL"}[base]
        name = f"{base.upper()} TMA {suffix}".strip()
        identifier = f"{base}-tma" + (f"-{number}" if number else "")
        remarks = f"Outside {airport} OPR HR, airspace is not active. Activation can be checked with Steenokkerzeel ATCC or Brussels FIC."
        if base != "kleine-brogel" or number == "1":
            remarks += f" As {airport} may be re-activated at any time, pilots are advised to avoid crossing whenever possible."
        control = f"{base.title()} APP"
        hours = f"See {airport} AD 2.3"
        if base == "beauvechain" and number == "2":
            control = "Beauvechain APP during EBBE OPR HR; Brussels APP outside EBBE OPR HR"
            hours += "; Brussels APP H24"
            remarks = "During EBBE OPR HR, controlled by Beauvechain APP; activation can be checked with Steenokkerzeel ATCC or Brussels FIC. Outside EBBE OPR HR, controlled by Brussels APP (Brussels Departure). As EBBE may be re-activated at any time, pilots are advised to avoid crossing whenever possible."
        if base == "beauvechain" and number == "3":
            remarks += " EBR05C excluded when active."
        if base == "florennes":
            remarks += " Aircraft shall maintain a listening watch with Florennes TWR when EBR06B is activated. Upon activation of Florennes TMA, aircraft shall comply promptly with instructions from Florennes APP. Lower limit 3500FT AMSL above Florennes CTR. Upper limit can be raised to FL095 outside Steenokkerzeel ATCC OPR HR (see NOTAM)."
        if base == "kleine-brogel":
            if number == "1":
                remarks += " Aircraft shall maintain a listening watch with Kleine-Brogel TWR when EBR07B is activated. Upon activation of Kleine-Brogel TMA ONE, aircraft shall comply promptly with instructions from Kleine-Brogel APP. Upper limit can be raised to FL075 outside Steenokkerzeel ATCC OPR HR (see NOTAM)."
            else:
                exclusions = "EBR05A and EBR05B" if number == "2" else "EBR05C and TRA17"
                remarks += f" {exclusions} excluded when active (activation can be checked with EBBL ATC or Steenokkerzeel ATCC)."
        properties = {
            "id": identifier.upper(), "name": name, "category": "Military",
            "lowerLimit": lower, "upperLimit": upper, "airspaceClass": "C",
            "controlUnit": control, "hours": hours, "remarks": remarks,
            "lateralLimits": lateral,
            "aipSource": "Belgium & Luxembourg AIP ENR 2.1, edition effective 03-SEP-2026",
            "aipSourceUrl": SOURCE_URL, "effectiveDate": "2026-09-03",
            "geometryNote": "Published AIP endpoints retained exactly; geodesic arcs sampled at maximum one degree. Border sections reuse the detailed Brussels UIR boundary. Conditional exclusions and vertical limits are described in remarks; activation is not evaluated live.",
        }
        feature = {"type": "Feature", "properties": properties, "geometry": geometry(lateral, border)}
        output = ROOT / "data/airspaces" / f"{base}-tma" / f"{identifier}.geojson"
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps({"type": "FeatureCollection", "name": name, "features": [feature]}, indent=2) + "\n", encoding="utf-8")
        print(output.relative_to(ROOT))


if __name__ == "__main__":
    main()
