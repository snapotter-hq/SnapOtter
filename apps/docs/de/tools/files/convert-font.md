---
description: "Schriften zwischen TTF, OTF, WOFF und WOFF2 konvertieren."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 3bdcf1e69c65
i18n_hash_version: 2
---

# Schrift konvertieren {#convert-font}

Konvertiert eine Schriftdatei zwischen TrueType (TTF), OpenType CFF (OTF), WOFF und WOFF2. Damit machen Sie aus einer Desktop-Schrift eine Webschrift oder erhalten aus einer OTF eine TTF für eine App, die nur TrueType annimmt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Akzeptiert Multipart-Formulardaten mit einer `.ttf`-, `.otf`-, `.woff`- oder `.woff2`-Datei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Nein | `ttf` | Ausgabeformat: `ttf`, `otf`, `woff` oder `woff2` |

## Beispielanfrage {#example-request}

OTF zu TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF zu WOFF2 für das Web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Hinweise {#notes}

- WOFF und WOFF2 sind komprimierte Hüllen um dieselben Schriftdaten. Eine Konvertierung in diese Formate oder aus ihnen lässt die Umrisse daher unverändert.
- OTF zu TTF wandelt kubische (CFF) Kurven in quadratische TrueType-Kurven um. Jede Kurve bleibt innerhalb von 1 Font-Einheit des Originals, was bei normalen Größen unsichtbar ist, die Konvertierung ist aber nicht exakt umkehrbar. TTF zu OTF behält die Kurvenformen bei und rundet nur Kontrollpunkte auf ganze Font-Einheiten.
- Die Einbettungsrechte der Schrift (das OS/2-Feld `fsType`) bleiben unverändert erhalten.
- Schriftsammlungen (`.ttc`) werden nicht unterstützt. Variable TrueType-Schriften lassen sich nicht in OTF umwandeln, variable CFF2-Schriften nicht in TTF. Konvertieren Sie diese stattdessen in WOFF oder WOFF2.
- Die Konvertierung läuft im Python-Dokument-Worker mit demselben Timeout wie die anderen Dokumentwerkzeuge, nicht im API-Prozess.
