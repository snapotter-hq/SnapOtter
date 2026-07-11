---
description: "Redukuj szum tła w dźwięku dzięki odszumianiu opartemu na FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 880c4ec75b1f
---

# Redukcja szumów {#noise-reduction}

Redukuj szum tła w pliku audio przy użyciu odszumiania opartego na FFT, z regulowaną siłą.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| strength | string | Nie | `"medium"` | Siła odszumiania: `light`, `medium`, `strong` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Uwagi {#notes}

- `light` zachowuje więcej szczegółów, ale usuwa mniej szumu. `strong` usuwa więcej szumu, ale może wprowadzać subtelne artefakty.
- Najlepsze wyniki na nagraniach ze stałym szumem tła (buczenie wentylatora, klimatyzacja, szum statyczny).
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
