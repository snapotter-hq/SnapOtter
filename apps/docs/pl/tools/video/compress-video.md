---
description: "Zmniejszenie rozmiaru pliku wideo z kontrolą jakości."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 1feb0f9888e6
---

# Compress Video {#compress-video}

Zmniejsza rozmiar pliku wideo przy użyciu konfigurowalnej siły kompresji i opcjonalnego zmniejszenia rozdzielczości.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Przyjmuje dane formularza multipart z plikiem wideo i polem JSON `settings`. To jest endpoint asynchroniczny - zwraca `202 Accepted` natychmiast, a postęp jest przesyłany strumieniowo przez SSE pod `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| quality | string | Nie | `"balanced"` | Siła kompresji: `light`, `balanced`, `strong` |
| resolution | string | Nie | `"original"` | Rozdzielczość wyjściowa: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Ustawienie wstępne `light` zachowuje jakość zbliżoną do oryginalnej. Ustawienie wstępne `strong` agresywnie zmniejsza rozmiar pliku kosztem wierności wizualnej.
- Zmniejszenie rozdzielczości (np. z 4K do 720p) łączy się z kompresją, dając znaczną redukcję rozmiaru.
- Aktualizacje postępu są dostępne przez SSE pod `GET /api/v1/jobs/{jobId}/progress` aż do zakończenia zadania.
