---
description: "Zamień zestaw obrazów w wideo pokazu slajdów, animowany GIF lub animowany WebP."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 81938a3f02f3
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Zamień zestaw obrazów w wideo pokazu slajdów z konfigurowalnym czasem wyświetlania każdego obrazu, rozdzielczością i liczbą klatek na sekundę albo w animowany GIF lub WebP ze stałym czasem na klatkę i liczbą powtórzeń.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Przyjmuje dane formularza multipart z dwoma lub większą liczbą plików obrazów i polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nie | `"mp4"` | Format wyjściowy: `mp4`, `gif`, `webp` |
| secondsPerImage | number | Nie | `2` | Tylko MP4. Czas wyświetlania na obraz w sekundach (0.5-10) |
| resolution | string | Nie | `"720p"` | Tylko MP4. Rozdzielczość wyjściowa: `1080p`, `720p`, `square` |
| fps | integer | Nie | `30` | Tylko MP4. Wyjściowa liczba klatek na sekundę (10-60) |
| frameDelayMs | integer | Nie | `500` | Tylko GIF i WebP. Czas wyświetlania każdego obrazu w milisekundach (20-10000) |
| loop | integer | Nie | `0` | Tylko GIF i WebP. Ile razy animacja jest odtwarzana; `0` oznacza zapętlenie w nieskończoność (0-100) |

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

Aby utworzyć animowany GIF, który pokazuje każdy obraz przez 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- W przypadku MP4 obrazy są skalowane i uzupełniane, aby dopasować się do docelowej rozdzielczości przy zachowaniu proporcji.
- Opcja rozdzielczości `square` tworzy wideo 1080x1080, przydatne w mediach społecznościowych.
- Wyjście MP4 to H.264, o nazwie `slideshow.mp4`.
- Wyjście GIF i WebP używa rozmiaru pierwszego obrazu. Obrazy o innych rozmiarach są skalowane, by zmieścić się w nim, a pozostały obszar jest przezroczysty. Plik nazywa się `slideshow.gif` lub `slideshow.webp`.
- GIF zapisuje czasy klatek w setnych częściach sekundy, więc `frameDelayMs` jest w GIF zaokrąglane do najbliższych 10 ms. WebP zachowuje dokładną wartość.
- Duże animacje są odrzucane, a nie budowane: rozmiar klatki razy liczba obrazów musi mieścić się w tym samym limicie pikseli, którego używają narzędzia GIF.
