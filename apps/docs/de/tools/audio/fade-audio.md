---
description: "Ein- und Ausblendeffekte zu Audio hinzufügen."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 5e10628738aa
---

# Audio ein-/ausblenden {#fade-audio}

Füge Ein- und Ausblendeffekte am Anfang und Ende einer Audiodatei hinzu.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Nein | `1` | Einblenddauer in Sekunden (0 bis 30) |
| fadeOutS | number | Nein | `1` | Ausblenddauer in Sekunden (0 bis 30) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Hinweise {#notes}

- Setze einen der Werte auf `0`, um diese Blendrichtung zu überspringen. Mindestens einer muss größer als 0 sein.
- Die Blenddauer wird auf die Audiolänge begrenzt, wenn sie diese überschreitet.
- Die Ausgabe behält üblicherweise den Eingabecontainer bei. AAC-Eingabe wird als M4A geschrieben, und nicht unterstützte Nur-Dekodier-Eingaben fallen auf MP3 zurück.
