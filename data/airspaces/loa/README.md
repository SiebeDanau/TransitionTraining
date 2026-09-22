# LoA in Explore

**Sectors** contains 13 Brussels ACC and 19 Maastricht UAC 2D sector
footprints from the user-provided *Brussels FIR/UIR 3D Model* KMZ, dated
03 October 2024. The KMZ's sector names and altitude surfaces are preserved;
the map displays lateral footprints while the detail panel shows vertical
limits. Several sectors have separate polygons or vertical variants with the
same name, so they remain distinct features. This is a training model, not
an indication of the active sector configuration. Extract `doc.kml` from the
KMZ and run `node scripts/import_brussels_fir_sectors.mjs path/to/doc.kml`
to regenerate `sectors.geojson`.
The abbreviations in the Explore list are display labels; only the full sector
names and geometry come from the KMZ.

This category groups neighbouring airspaces for training: Dutch MIL (Nieuw Milligen
TMA D1/D2, G1/G2 and Eindhoven TMA 1–4) and Nederland (Maastricht TMA 1–2
and Amsterdam CTA East 1/2, South 1/2 and West).
Enable **LoA** in Explore; it is initially hidden to avoid covering the Belgian map.
The category does not define Letter of Agreement procedures or transfer conditions.

**Special areas** contains SASKI A/B, AMRIV, ABNED, WOODY and Delta, from
Netherlands AIP ENR 2.2 section 8 (June 2026). Source definitions are maintained in
`special-areas-source.json`; the generator writes `special-areas.geojson`.
Unspecified classes, controlling units and hours are not inferred.
Walcheren Area and Eindhoven Area use the user-provided
`LoA Amsterdam ACC - Brussels ACC -- September 2026.pdf`: Annex D D.3.2 (D4,
chart D7), Annex B B.3.2.7 (B6, chart B19), and Annex D D.4.1.1 (D6).
These source pages are dated 11 June 2026 despite the September filename.
Their source metadata overrides the AIP defaults. Walcheren's upper boundary is
FL 125; FL 120 is the maximum usable level. Activation conditions are included in
remarks; the static map does not indicate live activation status.

L179 Area uses the same supplied LoA, Annex B B.3.1.7 (B4, chart B14):
FL 095–195, class B, ATS provided by Brussels ACC. Its southern/western edge
follows the shared Dutch-Belgian border; it is separate from ATS route L179.

Extended TMA G1 uses Annex D D.3.1 (D4, chart D7): FL 055–095, class A.
LoA endpoints are preserved; the two south-coast segments use intermediate AIP
Nieuw Milligen TMA G1 anchors as a shoreline approximation. The exact textual
boundary and this limitation are retained in the feature metadata.

New airspace coordinates and limits were transcribed from Netherlands AIP ENR 2.1,
AIRAC AMDT 06/2026, effective 11 June 2026. The September 2026 issue could not be
retrieved due to the publisher's access challenge; current-cycle verification is
outstanding. Maastricht reuses the repository's existing geometries and provenance.

Run `node scripts/generate_loa_geojson.mjs` from the repository root to regenerate.
National-border segments reuse the detailed Amsterdam FIR boundary. The map shows
lateral envelopes: altitude-dependent exclusions (especially TMA D1) are recorded
in the detail panel rather than subtracted from this two-dimensional footprint.
