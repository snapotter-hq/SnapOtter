---
description: "Welke anonieme gebruiksgegevens SnapOtter verzamelt, wanneer die worden verstuurd, en hoe je instance-brede productanalytics uitschakelt."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: b5dad7c63a7d
---

# Wat SnapOtter verzamelt {#what-snapotter-collects}

Anonieme productanalytics staat standaard aan en wordt door een beheerder voor de hele instance ingesteld. Schakel het uit onder Settings > System > Privacy.

## Events die we versturen (indien ingeschakeld) {#events-we-send-when-enabled}

- tool_used: tool-id, status, duur, categorie, of het een AI-tool is, een foutcode bij een mislukking.
- pipeline_executed: aantal stappen, tool-id's, batch-flag, aantal bestanden, duur, status.
- ai_bundle_action: bundle-id, actie, duur.
- Frontend-gebruik: welke tool-pagina's geopend worden, toegevoegde bestanden (alleen aantallen), gestarte tool, downloads, opslagacties, zoekopdrachten (alleen aantal resultaten), verwerkte batches.
- Crashrapporten: fouttype en een broncall-stack met alleen basisbestandsnamen.

## Wat we nooit verzamelen {#what-we-never-collect}

- Bestandsnamen of paden
- Bestandsinhoud
- OCR-uitvoertekst
- Afbeeldingsmetadata (EXIF)
- Geëxtraheerde documenttekst
- Je IP-adres of accountidentiteit

## Uitschakelen {#turning-it-off}

Beheerders: Settings > System > Privacy, zet "Anonymous Product Analytics" uit. Het stopt onmiddellijk, instance-breed. Om een image te bouwen die nooit iets kan versturen, stel je de build-arg `SNAPOTTER_ANALYTICS=off` in.
