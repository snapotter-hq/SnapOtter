---
description: "Wyrównaj głośność do standardowych poziomów nadawczych (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: c1a5d9c5aa2a
---

# Normalizuj audio {#normalize-audio}

Wyrównaj głośność dźwięku do standardowych poziomów nadawczych, używając normalizacji EBU R128 (-16 LUFS).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Stosuje normalizację głośności EBU R128 automatycznie.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- Używa standardu głośności EBU R128, celując w -16 LUFS.
- Idealne do podcastów, audiobooków i treści nadawczych, gdzie ważna jest spójna głośność.
- Źródłowa częstotliwość próbkowania jest zachowywana w wyjściu.
- Wyjście zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane awaryjnie jako MP3.
