---
description: "Vilken anonym användningsdata SnapOtter samlar in, när den skickas och hur man stänger av instansomfattande produktanalys."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: cbcbfa761e7b
i18n_hash_version: 2
---

# Vad SnapOtter samlar in {#what-snapotter-collects}

Anonym produktanalys är på som standard och ställs in för hela instansen av en administratör. Stäng av den under Settings > System > Privacy.

## Händelser vi skickar (när aktiverat) {#events-we-send-when-enabled}

- tool_used: verktygs-id, status, varaktighet, kategori, om det är ett AI-verktyg, en felkod vid misslyckande.
- pipeline_executed: antal steg, verktygs-id:n, batch-flagga, antal filer, varaktighet, status.
- ai_bundle_action: paket-id, åtgärd, varaktighet.
- Frontend-användning: vilka verktygssidor som öppnas, tillagda filer (endast antal), verktyg startat, nedladdningar, sparanden, sökning (endast antal resultat), batch bearbetad.
- Kraschrapporter: feltyp, ett rensat felmeddelande (filnamn, sökvägar, e-postadresser och citerade värden borttagna), en källstack med filbasnamn och, för AI-verktyg, en Python-traceback med endast filbasnamn.

## Vad vi aldrig samlar in {#what-we-never-collect}

- Filnamn eller sökvägar
- Filinnehåll
- OCR-utdatatext
- Bildmetadata (EXIF)
- Extraherad dokumenttext
- Din kontoidentitet

Precis som alla servrar ser PostHog IP-adressen som varje förfrågan kommer från. Vårt PostHog-projekt kastar den i stället för att lagra den, och SnapOtters egna serverhändelser skickar en platshållare i dess ställe.

## Uppdateringsmeddelanden {#update-notices}

Så länge analys är på frågar servern PostHog med några timmars mellanrum vilken SnapOtter-version som är nyast, med instansens anonyma ID och dess version. Finns en nyare version ser administratörer ett meddelande med en länk till versionsinformationen. Stänger du meddelandet visas det inte igen förrän nästa version. Inget installeras eller laddas ned åt dig, och med analys avstängd frågar servern aldrig.

## Stänga av det {#turning-it-off}

Administratörer: Settings > System > Privacy, slå av "Anonymous Product Analytics". Det stoppas omedelbart, instansomfattande. För att bygga en image som aldrig kan sända, sätt build-argumentet `SNAPOTTER_ANALYTICS=off`.

För att starta en ny instans med analys redan avstängd lägger du till `SNAPOTTER_ANALYTICS_DEFAULT=off` i serverns miljö före första uppstarten. Med Docker Compose lägger du den under app-tjänstens `environment:`, eftersom en inställning enbart i `.env` inte når containern.
