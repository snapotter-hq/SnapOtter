---
description: "Erzeugt einen winzigen Platzhalter in niedriger Qualität mit Base64-Data-URI."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: a18e4151550b
---

# LQIP-Platzhalter {#lqip-placeholder}

Erzeugt einen winzigen Platzhalter in niedriger Qualität (LQIP) aus einem Ausgangsbild. Gibt eine kleine Platzhalterdatei zusammen mit einem Base64-Data-URI, einem fertigen HTML-`<img>`-Tag und einem CSS-`background-image`-Snippet zum sofortigen Einbetten zurück.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| width | integer | Nein | `16` | Zielbreite in Pixeln (4-64) |
| blur | number | Nein | `2` | Unschärferadius für die Unschärfe-Strategie (0-20) |
| strategy | string | Nein | `"blur"` | Platzhalter-Strategie: `blur`, `pixelate` oder `solid` |
| format | string | Nein | `"webp"` | Ausgabeformat: `webp`, `png` oder `jpeg` |
| quality | integer | Nein | `50` | Ausgabequalität (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Hinweise {#notes}

- Das Feld `dataUri` enthält den vollständigen Data-URI, bereit zur Verwendung in `src`-Attributen oder CSS ohne zusätzliche Anfragen.
- Die Felder `html` und `css` liefern zum Kopieren fertige Snippets für gängige Anwendungsfälle.
- Die Strategie `blur` erzeugt ein weiches, unscharfes Vorschaubild. Die Strategie `pixelate` erstellt ein klotziges Mosaik. Die Strategie `solid` gibt eine einzige gemittelte Farbe zurück.
- Typische Platzhaltergrößen liegen bei 200-500 Bytes, was sie für das direkte Inlining in HTML geeignet macht.
- Die Höhe wird automatisch berechnet, um das Seitenverhältnis des Ausgangsbilds zu erhalten.
- HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch decodiert.
