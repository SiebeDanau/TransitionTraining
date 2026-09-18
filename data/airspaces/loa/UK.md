# UK airspace adjoining Brussels FIR

Enable **LoA → UK** in Explore. Individual areas and their groups can be toggled.

Source: [UK AIP ENR 2.1, AIRAC 09/2026, effective 3 September 2026](https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-09-03-AIRAC/html/eAIP/EG-ENR-2.1-en-GB.html), retrieved 14 September 2026.
`uk-source.json` preserves the eight published name, lateral-limit and vertical-limit cells.
Run `python scripts/generate_uk_loa_geojson.py` to regenerate `uk.geojson`.

The relevant border is the London–Brussels FIR boundary above the North Sea:
51°07′N–51°30′N along 002°00′E. From north to south, below FL195:

| Area | Border latitude interval | Lower limit | Upper limit | Class |
| --- | --- | --- | --- | --- |
| Clacton CTA 7 | 51°29′22″–51°30′00″N | FL65 | FL195 | A |
| Clacton CTA 9 | 51°19′48″–51°29′22″N | FL105 | FL195 | A |
| Worthing CTA 5 | 51°12′51″–51°19′48″N | FL105 | FL195 | A |
| Worthing CTA 3 | 51°07′00″–51°12′51″N | FL75 | FL195 | A |

Southern CTA covers this border from FL195 to FL245 (C); Upper Airspace CTA
from FL245 to FL660 (C). London FIR (SFC–FL245) and London UIR (FL245–FL660)
provide context. The FIR background classes do not override designated CTA classes.

All polygons retain their complete published extent, including portions away from
Belgium. Overlapping FIR/UIR and CTA layers are intentional. The category is hidden
by default. These are AIP airspace boundaries, not LoA transfer levels or sectors.
