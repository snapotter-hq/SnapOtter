---
description: "Einen Klingeltonclip aus einer beliebigen Audiodatei erstellen."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 01dc137604bf
---

# Klingelton-Ersteller {#ringtone-maker}

Erstelle einen Klingeltonclip (.m4r) aus einer beliebigen Audiodatei, indem du eine Startzeit und Dauer auswählst.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| startS | number | Nein | `0` | Startzeit in Sekunden (Minimum 0) |
| durationS | number | Nein | `30` | Clipdauer in Sekunden (1 bis 30) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Hinweise {#notes}

- Die Ausgabe ist immer im M4R-Format, kompatibel mit iPhone-Klingeltönen.
- Die maximale Klingeltondauer beträgt 30 Sekunden (Apple-Limit).
- Jedes Audioformat kann als Eingabe verwendet werden.
