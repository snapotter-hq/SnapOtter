---
description: "Welke anonieme gebruiksgegevens SnapOtter verzamelt, wanneer die worden verstuurd, en hoe je instance-brede productanalytics uitschakelt."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: 02d5b2596e37
i18n_hash_version: 2
---

# Wat SnapOtter verzamelt {#what-snapotter-collects}

Anonieme productanalytics staat standaard aan en wordt door een beheerder voor de hele instance ingesteld. Schakel het uit onder Settings > System > Privacy.

## Events die we versturen (indien ingeschakeld) {#events-we-send-when-enabled}

- tool_used: tool-id, status, duur, categorie, of het een AI-tool is, een foutcode bij een mislukking.
- pipeline_executed: aantal stappen, tool-id's, batch-flag, aantal bestanden, duur, status.
- ai_bundle_action: bundle-id, actie, duur.
- Frontend-gebruik: welke tool-pagina's geopend worden, toegevoegde bestanden (alleen aantallen), gestarte tool, downloads, opslagacties, zoekopdrachten (alleen aantal resultaten), verwerkte batches.
- Crashrapporten: fouttype, een opgeschoonde foutmelding (bestandsnamen, paden, e-mailadressen en waarden tussen aanhalingstekens verwijderd), een bronstack met basisbestandsnamen en, voor AI-tools, een Python-traceback met alleen basisbestandsnamen.

## Wat we nooit verzamelen {#what-we-never-collect}

- Bestandsnamen of paden
- Bestandsinhoud
- OCR-uitvoertekst
- Afbeeldingsmetadata (EXIF)
- Geëxtraheerde documenttekst
- Je accountidentiteit

PostHog ziet, zoals elke server, het IP-adres waar elk verzoek vandaan komt. Ons PostHog-project gooit het weg in plaats van het op te slaan, en de eigen serverevents van SnapOtter sturen in plaats daarvan een placeholder mee.

## Updatemeldingen {#update-notices}

Zolang analyse aan staat, vraagt de server elke paar uur aan PostHog welke SnapOtter-release de nieuwste is, met de anonieme ID van de instantie en de versie ervan. Is er een nieuwere release, dan zien beheerders een melding met een link naar de release notes. Sluit je de melding, dan blijft die verborgen tot de volgende release. Er wordt niets voor je geïnstalleerd of gedownload, en met analyse uit vraagt de server het nooit.

## Uitschakelen {#turning-it-off}

Beheerders: Settings > System > Privacy, zet "Anonymous Product Analytics" uit. Het stopt onmiddellijk, instance-breed. Om een image te bouwen die nooit iets kan versturen, stel je de build-arg `SNAPOTTER_ANALYTICS=off` in.

Wil je een nieuwe instance starten met analyse al uitgeschakeld, voeg dan `SNAPOTTER_ANALYTICS_DEFAULT=off` toe aan de omgeving van de server vóór de eerste keer opstarten. Zet het bij Docker Compose onder `environment:` van de app-service, want alleen instellen in `.env` bereikt de container niet.
