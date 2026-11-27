---
description: "Przytnij wszystkie strony pliku PDF według marginesów lub do wybranego obszaru."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 8437aec75ec9
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Przytnij wszystkie strony pliku PDF jednym marginesem na każdej krawędzi, osobnym marginesem dla każdej krawędzi albo do wybranego obszaru, na przykład etykiety wysyłkowej wydrukowanej w rogu arkusza.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides`, lub `region` |
| margin | number | No | `20` | Tryb `uniform`: margines przycięcia dla każdej krawędzi w punktach (0-2000) |
| top, right, bottom, left | number | No | `0` | Tryb `sides`: margines przycięcia dla każdej krawędzi osobno w punktach (0-2000) |
| x, y | number | No | `0` | Tryb `region`: odległość obszaru od lewej i górnej krawędzi strony w punktach |
| width, height | number | No | `288`, `432` | Tryb `region`: rozmiar obszaru w punktach (etykieta 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Zachowaj tylko etykietę 4x6 in w lewym górnym rogu każdej strony:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Wszystkie wartości są podawane w punktach PDF (1 punkt = 1/72 cala). Strona US Letter ma 612 x 792 punktów.
- Każdy tryb odczytuje tylko własne pola, więc żądanie wysyłające wyłącznie `margin` nadal działa.
- Obszar jest mierzony od lewego górnego rogu każdej strony i musi mieścić się na każdej stronie. Marginesy muszą pozostawiać część każdej strony. W przeciwnym razie żądanie kończy się błędem `400`.
- Na stronie ustawionej tak, by była wyświetlana obrócona, pozycje i krawędzie odnoszą się do strony w takiej postaci, w jakiej jest wyświetlana, więc lewy górny róg obszaru to lewy górny róg obróconej strony.
- Każdy tryb mierzy od pełnego media box, więc przycięcie strony, która jest już przycięta, zaczyna się od pełnej strony. Jednolity margines `0` pokazuje cały media box.
