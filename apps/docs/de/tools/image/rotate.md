---
description: "Drehe Bilder um jeden beliebigen Winkel und spiegle sie horizontal oder vertikal."
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: b73dc2e4ca1c
---

# Bild drehen & spiegeln {#rotate-flip}

Drehe Bilder um einen beliebigen Winkel und/oder spiegle sie horizontal oder vertikal. Dreh- und Spiegeloperationen können in einer einzigen Anfrage kombiniert werden.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| angle | number | Nein | `0` | Drehwinkel in Grad (im Uhrzeigersinn). Akzeptiert jeden numerischen Wert. |
| horizontal | boolean | Nein | `false` | Das Bild horizontal spiegeln (Spiegelbild) |
| vertical | boolean | Nein | `false` | Das Bild vertikal spiegeln |

## Beispielanfrage {#example-request}

90 Grad im Uhrzeigersinn drehen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Horizontal spiegeln:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Drehen und Spiegeln zusammen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Hinweise {#notes}

- Zuerst wird die Drehung angewendet, dann die Spiegeloperationen.
- Drehungen, die nicht 90 Grad betragen (z. B. 45 Grad), vergrößern die Leinwand, damit das gedrehte Bild passt, mit transparenter oder schwarzer Füllung je nach Ausgabeformat.
- Gängige Werte: 90, 180, 270 für Vierteldrehungen.
- Die EXIF-Orientierung wird vor der Verarbeitung automatisch angewendet, sodass die Drehung relativ zur visuellen Orientierung erfolgt.
