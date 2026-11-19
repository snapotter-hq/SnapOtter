---
description: "Welke anonieme gebruiksgegevens SnapOtter verzamelt, wanneer ze worden verstuurd, hoe de keuze bij de eerste start werkt en hoe je de productanalyse voor de hele instantie uitschakelt."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: 884b36a4dea9
i18n_hash_version: 2
---

# Wat SnapOtter verzamelt {#what-snapotter-collects}

Anonymous Product Analytics wordt door een beheerder voor de hele instantie ingesteld. Een nieuwe instantie vraagt het bij de eerste start en verstuurt niets totdat iemand antwoordt. Je kunt het op elk moment wijzigen onder Settings > System > Privacy.

Als analyse aan staat, stuurt SnapOtter naar PostHog welke tools en pipelines draaien, hoe lang ze duren, of ze slagen, foutcodes en aantallen bestanden, samen met de anonieme id van de instantie, de versie, de CPU-architectuur, het besturingssysteem, het installatietype en of er een GPU is. Crashrapporten gaan naar Sentry, waarbij bestandsnamen, paden, e-mailadressen en waarden tussen aanhalingstekens zijn verwijderd. Er worden nooit je bestanden verstuurd, ook niet hun namen of paden, hun inhoud, OCR-uitvoer of uitgelezen tekst, afbeeldingsmetadata of je accountidentiteit. PostHog en Sentry zijn de enige twee bestemmingen waarnaar iets wordt verstuurd, en met analyse uit gaat er naar geen van beide iets heen.

- tool_used: tool-id, status, duur, categorie, of het een AI-tool is, een foutcode bij een mislukking en de stapnaam voor een tool die één fase apart meldt (de analysestap van Passport Photo).
- pipeline_executed: aantal stappen, tool-id's, batch-flag, aantal bestanden, duur, status.
- ai_bundle_action: bundle-id, actie (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), duur en bij een mislukte installatie een foutcategorie uit een vaste lijst (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). Uitvoer van het installatieprogramma, paden en foutmeldingen worden nooit verzonden.
- Frontend-gebruik: welke tool-pagina's geopend worden, toegevoegde bestanden (alleen aantallen), gestarte tool, downloads, opslagacties, zoekopdrachten (alleen aantal resultaten), verwerkte batches.
- Crashrapporten: fouttype, een opgeschoonde foutmelding (bestandsnamen, paden, e-mailadressen en waarden tussen aanhalingstekens verwijderd), een bronstack met basisbestandsnamen en, voor AI-tools, een Python-traceback met alleen basisbestandsnamen.

## Wat we nooit verzamelen {#what-we-never-collect}

- Bestandsnamen of paden
- Bestandsinhoud
- OCR-uitvoertekst
- Afbeeldingsmetadata (EXIF)
- Uit documenten gehaalde tekst
- Je accountidentiteit

PostHog ziet het IP-adres waarvan elk verzoek afkomstig is, zoals elke server. Ons PostHog-project gooit het weg in plaats van het op te slaan, en de eigen serverevents van SnapOtter sturen in plaats daarvan een tijdelijke aanduiding mee.

## Updatemeldingen {#update-notices}

Zolang analyse aan staat, vraagt de server om de paar uur aan PostHog welke SnapOtter-release de nieuwste is, met de anonieme id van de instantie en de versie. Als er een nieuwere release is, zien beheerders een melding met een link naar de release-opmerkingen. Sluit je de melding, dan blijft ze verborgen tot de volgende release. Er wordt niets voor je geïnstalleerd of gedownload, en met analyse uit vraagt de server nooit iets.

## Uitschakelen {#turning-it-off}

Beheerders: Settings > System > Privacy, zet "Anonymous Product Analytics" uit. Het stopt direct, voor de hele instantie. Om een image te bouwen die nooit iets kan versturen, stel je het build-argument `SNAPOTTER_ANALYTICS=off` in. `SNAPOTTER_TELEMETRY=off` in de omgeving van de server doet hetzelfde tijdens runtime en gaat voor op elk antwoord dat in de app is opgeslagen.

Om de vraag bij de eerste start vooraf te beantwoorden, voeg je `SNAPOTTER_ANALYTICS_DEFAULT=off` (of `on`) toe aan de omgeving van de server vóór de eerste opstart, en dan wordt niemand iets gevraagd. Zet het bij Docker Compose onder `environment:` van de app-service, omdat het alleen instellen in `.env` de container niet bereikt.
