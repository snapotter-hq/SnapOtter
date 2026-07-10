---
description: "Vilken anonym användningsdata SnapOtter samlar in, när den skickas och hur man stänger av instansomfattande produktanalys."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 59a586e4d3ef
---

# Vad SnapOtter samlar in {#what-snapotter-collects}

Anonym produktanalys är på som standard och ställs in för hela instansen av en administratör. Stäng av den under Settings > System > Privacy.

## Händelser vi skickar (när aktiverat) {#events-we-send-when-enabled}

- tool_used: verktygs-id, status, varaktighet, kategori, om det är ett AI-verktyg, en felkod vid misslyckande.
- pipeline_executed: antal steg, verktygs-id:n, batch-flagga, antal filer, varaktighet, status.
- ai_bundle_action: paket-id, åtgärd, varaktighet.
- Frontend-användning: vilka verktygssidor som öppnas, tillagda filer (endast antal), verktyg startat, nedladdningar, sparanden, sökning (endast antal resultat), batch bearbetad.
- Kraschrapporter: feltyp och en källstack med endast filbasnamn.

## Vad vi aldrig samlar in {#what-we-never-collect}

- Filnamn eller sökvägar
- Filinnehåll
- OCR-utdatatext
- Bildmetadata (EXIF)
- Extraherad dokumenttext
- Din IP-adress eller kontoidentitet

## Stänga av det {#turning-it-off}

Administratörer: Settings > System > Privacy, slå av "Anonymous Product Analytics". Det stoppas omedelbart, instansomfattande. För att bygga en image som aldrig kan sända, sätt build-argumentet `SNAPOTTER_ANALYTICS=off`.
