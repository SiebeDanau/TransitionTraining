# Belgische AIP-routes

`routes-belgium.json` bevat uitsluitend `routes`, met per route `id` en een geordende lijst `points`. Hoogtes, afstanden, beschikbaarheid en andere operationele gegevens zijn niet opgenomen.

Bron: AIP Belgium and Luxembourg, publicatie geldig vanaf **3 september 2026**, geraadpleegd op **7 september 2026**:

- [ENR 3.1 – Conventional Navigation Routes](https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/html/eAIP/EB-ENR-3.1-en-GB.html): NIL.
- [ENR 3.2 – Area Navigation Routes](https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/html/eAIP/EB-ENR-3.2-en-GB.html): 51 RNAV-routes.
- [ENR 3.3 – Other Routes](https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/html/eAIP/EB-ENR-3.3-en-GB.html): 37 militaire routes/varianten (BENE, FALCON, DARK FALCON, vier 15W-transportroutes, veertien NVG-routes en twee TACAN-routes).

De puntenvolgorde volgt de publicatie. Herhaalde punten blijven behouden; de lijst wordt niet automatisch gesloten of omgekeerd. Ook gepubliceerde punten buiten België blijven behouden. Navigatiebakens gebruiken hun identificatie, bijvoorbeeld `COA` en `KOK`. NVG-puntnamen zoals `BIERB.` en `EBFS D` blijven letterlijk behouden. Het onbenoemde punt van BENE FOUR SHORT is opgeslagen als `502200N 0051200E`; hiervoor is geen identificatie verzonnen.

Verwijzingen naar de basisroute bij verkorte militaire varianten zijn uitgewerkt tot puntenlijsten. Daarbij zijn de volgende aansluitingen geïnterpreteerd uit de beschrijving en de volgorde van de basisroute: BENE TWO SHORT en BENE TWO BAF SHORT volgen de basisroute tot ABJEH en sluiten na AFKEQ weer aan op AKHEW; FALCON ROUTE SHORT sluit na AFKEQ eveneens aan op AKHEW. BENE SIX EBFS volgt tussen APSUH en RUHUW de gepubliceerde punten ACGUC en GILHE, en tussen AXJUQ en JUZPA de punten ACKEF, AGVUZ en AGTAQ. De tekst specificeert deze aansluitingen niet allemaal expliciet als volledige puntenlijst.

Vrij te kiezen directe routes en de losse NVG-sectorpuntcatalogi zijn geen vaste routes en zijn daarom niet als routes opgenomen. De NVG-tabellen met vaste combinaties zijn wel opgenomen. ROUTE 1 t/m ROUTE 4 zijn de namen uit ENR 3.3 § 2.3 (15W TPT).

Explore laadt deze dataset via de kaartcatalogus. De kaartlijnen worden tijdens het laden afgeleid van de bestaande puntgegevens; de routebestanden blijven uitsluitend identificaties en puntenlijsten bevatten. Niet alle militaire puntidentificaties komen voor in de bestaande ENR 4-puntbestanden. Ontbrekende punten worden vermeld in de routegegevens in Explore; de kaart verbindt alleen opeenvolgende bekende punten en slaat geen onbekende punten over.
