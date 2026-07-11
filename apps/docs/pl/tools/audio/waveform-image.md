---
description: "Generuje wizualizację przebiegu fali jako obraz PNG z pliku audio."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 321cbbf1a4a7
---

# Waveform Image {#waveform-image}

Generuje wizualizację przebiegu fali jako obraz PNG z pliku audio, z konfigurowalnymi wymiarami i kolorem.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Nie | `1024` | Szerokość obrazu w pikselach (od 256 do 3840) |
| height | integer | Nie | `256` | Wysokość obrazu w pikselach (od 64 do 1080) |
| color | string | Nie | `"#4f46e5"` | Kolor przebiegu fali w formacie hex (np. `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Wynikiem jest zawsze obraz PNG, niezależnie od formatu wejściowego audio.
- Przebieg fali jest renderowany na przezroczystym tle.
- Przydatne do miniatur, podglądów w mediach społecznościowych lub osadzania na stronach internetowych.
