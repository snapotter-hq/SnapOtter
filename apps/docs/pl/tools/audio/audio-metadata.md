---
description: "Wyświetlaj, edytuj lub usuwaj znaczniki metadanych audio (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 0ab952a9158a
---

# Metadane audio {#audio-metadata}

Wyświetlaj, edytuj lub usuwaj znaczniki metadanych audio, takie jak tytuł, wykonawca i album (ID3 i podobne formaty znaczników).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| strip | boolean | Nie | `false` | Usuwa wszystkie istniejące znaczniki metadanych |
| title | string | Nie | - | Ustawia znacznik tytułu (maks. 500 znaków) |
| artist | string | Nie | - | Ustawia znacznik wykonawcy (maks. 500 znaków) |
| album | string | Nie | - | Ustawia znacznik albumu (maks. 500 znaków) |

## Przykładowe żądanie {#example-request}

Edytuj znaczniki metadanych:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Usuń wszystkie metadane:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Uwagi {#notes}

- Odpowiedź zawiera obiekt `metadata` z formatem kontenera, czasem trwania, przepływnością i bieżącymi znacznikami.
- Gdy `strip` ma wartość `true`, wszystkie pola znaczników są ignorowane, a każdy istniejący znacznik jest usuwany.
- Aktualizowane są tylko dostarczone przez Ciebie znaczniki; niepodane znaczniki pozostają niezmienione.
- Format wyjściowy jest zgodny z formatem wejściowym.
