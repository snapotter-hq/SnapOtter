---
description: "Utworzenie wideo pokazu slajdów z zestawu obrazów."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: ced4164f687d
---

# Images to Video {#images-to-video}

Tworzy wideo pokazu slajdów z zestawu obrazów z konfigurowalnym czasem wyświetlania każdego obrazu, rozdzielczością i liczbą klatek na sekundę.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Przyjmuje dane formularza multipart z dwoma lub większą liczbą plików obrazów i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | Nie | `2` | Czas wyświetlania na obraz w sekundach (0.5-10) |
| resolution | string | Nie | `"720p"` | Rozdzielczość wyjściowa: `1080p`, `720p`, `square` |
| fps | integer | Nie | `30` | Wyjściowa liczba klatek na sekundę (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Przyjmuje 2-60 plików obrazów na żądanie. Obrazy pojawiają się w wideo w kolejności przesyłania.
- Obrazy są skalowane i uzupełniane, aby dopasować się do docelowej rozdzielczości przy zachowaniu proporcji.
- Opcja rozdzielczości `square` tworzy wideo 1080x1080, przydatne w mediach społecznościowych.
- Formatem wyjściowym jest zawsze MP4 (H.264).
