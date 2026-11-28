---
description: "Vilka anonyma användningsdata SnapOtter samlar in, när de skickas, att analysen är på som standard och hur en administratör stänger av produktanalysen för hela instansen."
i18n_source_hash: 22d89115c8e5
i18n_provenance: machine
i18n_output_hash: e8bd941b7a0e
i18n_hash_version: 2
---

# Vad SnapOtter samlar in {#what-snapotter-collects}

Anonymous Product Analytics är på som standard i varje instans, utan någon fråga vid första start. En administratör kan stänga av det för hela instansen under Settings > System > Privacy, och då upphör all analystrafik till PostHog och Sentry.

När analys är på skickar SnapOtter till PostHog vilka verktyg och pipelines som körs, hur lång tid de tar, om de lyckas, felkoder och antal filer, tillsammans med instansens anonyma id, dess version, CPU-arkitektur, operativsystem, installationstyp och om den har en GPU. Kraschrapporter skickas till Sentry med filnamn, sökvägar, e-postadresser och värden inom citattecken borttagna. Den skickar aldrig dina filer, deras namn eller sökvägar, deras innehåll, OCR-utdata eller extraherad text, bildmetadata eller din kontoidentitet. PostHog och Sentry är de enda två platser dit något skickas, och när analys är av skickas ingenting till någon av dem.

## Händelser vi skickar (när det är aktiverat) {#events-we-send-when-enabled}

- tool_used: verktygs-id, status, varaktighet, kategori, om det är ett AI-verktyg, en felkod vid misslyckande och stegnamnet för ett verktyg som rapporterar ett steg för sig (analyssteget i Passport Photo).
- pipeline_executed: antal steg, verktygs-id:n, batch-flagga, antal filer, varaktighet, status.
- ai_bundle_action: paket-id, åtgärd (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment` eller `imported`), varaktighet och, vid en misslyckad installation, en felkategori från en fast lista (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout` eller `other`). Installationsutdata, sökvägar och felmeddelanden skickas aldrig.
- Frontend-användning: vilka verktygssidor som öppnas, tillagda filer (endast antal), verktyg startat, nedladdningar, sparanden, sökning (endast antal resultat), batch bearbetad.
- Kraschrapporter: feltyp, ett rensat felmeddelande (filnamn, sökvägar, e-postadresser och citerade värden borttagna), en källstack med filbasnamn och, för AI-verktyg, en Python-traceback med endast filbasnamn.

## Vad vi aldrig samlar in {#what-we-never-collect}

- Filnamn eller sökvägar
- Filinnehåll
- OCR-utdatatext
- Bildmetadata (EXIF)
- Extraherad dokumenttext
- Din kontoidentitet

PostHog ser den IP-adress som varje begäran kommer från, som vilken server som helst. Vårt PostHog-projekt förkastar den i stället för att lagra den, och SnapOtters egna serverhändelser skickar en platshållare i dess ställe.

## Uppdateringsaviseringar {#update-notices}

Medan analys är på frågar servern PostHog med några timmars mellanrum vilken SnapOtter-version som är nyast, med instansens anonyma id och dess version. När en nyare version finns ser administratörer en avisering med en länk till versionsanteckningarna. Avfärdar du den förblir den dold tills nästa version. Inget installeras eller laddas ned åt dig, och när analys är av frågar servern aldrig.

## Stänga av det {#turning-it-off}

Administratörer: Settings > System > Privacy, stäng av "Anonymous Product Analytics". Det upphör omedelbart, för hela instansen, och inget mer skickas till PostHog eller Sentry. Om du vill bygga en image som aldrig kan skicka något, ange build-argumentet `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` i serverns miljö gör detsamma vid körning, utan ombyggnad.

Om du vill starta en ny instans med analysen redan av lägger du till `SNAPOTTER_ANALYTICS_DEFAULT=off` i serverns miljö före dess första start. Med Docker Compose lägger du det under `environment:` för appens tjänst, eftersom att ange det bara i `.env` inte når containern.
