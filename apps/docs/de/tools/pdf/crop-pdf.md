---
description: "Alle Seiten einer PDF mit Rändern zuschneiden oder auf einen Bereich begrenzen."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 7f4ce70c6994
i18n_hash_version: 2
---

# PDF zuschneiden {#crop-pdf}

Schneiden Sie alle Seiten einer PDF mit einem Rand an jeder Kante, einem eigenen Rand pro Kante oder auf einen Bereich zu, etwa ein Versandetikett, das in einer Ecke des Blatts gedruckt ist.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `uniform` | `uniform`, `sides` oder `region` |
| margin | number | Nein | `20` | Modus `uniform`: Zuschneiderand für jede Kante in Punkten (0-2000) |
| top, right, bottom, left | number | Nein | `0` | Modus `sides`: Zuschneiderand für jede einzelne Kante in Punkten (0-2000) |
| x, y | number | Nein | `0` | Modus `region`: Abstand des Bereichs vom linken und oberen Seitenrand in Punkten |
| width, height | number | Nein | `288`, `432` | Modus `region`: Größe des Bereichs in Punkten (ein 4x6 in großes Etikett) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Behalten Sie nur das 4x6 in große Etikett in der oberen linken Ecke jeder Seite:

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

- Alle Werte sind in PDF-Punkten angegeben (1 Punkt = 1/72 Zoll). Eine Seite im Format US Letter ist 612 x 792 Punkte groß.
- Jeder Modus liest nur seine eigenen Felder, sodass eine Anfrage, die nur `margin` sendet, weiterhin funktioniert.
- Ein Bereich wird von der oberen linken Ecke jeder Seite aus gemessen und muss in jede Seite passen. Die Ränder müssen von jeder Seite etwas übrig lassen. Andernfalls schlägt die Anfrage mit `400` fehl.
- Bei einer Seite, die gedreht angezeigt wird, beziehen sich Positionen und Kanten auf die Seite, wie sie angezeigt wird, sodass die obere linke Ecke eines Bereichs die obere linke Ecke der gedrehten Seite ist.
- Jeder Modus misst ab der vollständigen Media-Box, daher beginnt das Zuschneiden einer bereits zugeschnittenen Seite wieder bei der vollständigen Seite. Ein einheitlicher Rand von `0` zeigt die gesamte Media-Box.
