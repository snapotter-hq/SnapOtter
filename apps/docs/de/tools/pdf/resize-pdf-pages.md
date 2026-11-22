---
description: "Ändert die Größe jeder PDF-Seite auf A4, Letter, ein 4x6-in-Versandetikett oder ein benutzerdefiniertes Maß."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 2c3e2ebce3b9
i18n_hash_version: 2
---

# PDF-Seitengröße ändern {#resize-pdf-pages}

Ändert die Seitengröße aller Seiten einer PDF. Der Inhalt wird skaliert, passt auf die neue Seite und wird zentriert, sodass Text, Vektorgrafiken und Barcodes scharf bleiben. Damit machst du aus einem Versandetikett eine 4x6-in-Seite für einen Thermodrucker oder wechselst bei einem Dokument zwischen A4 und US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nein | `"4x6in"` | Zielgröße: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` oder `custom` |
| width | number | Nein | `4` | Benutzerdefinierte Seitenbreite, verwendet, wenn `pageSize` `custom` ist |
| height | number | Nein | `6` | Benutzerdefinierte Seitenhöhe, verwendet, wenn `pageSize` `custom` ist |
| unit | string | Nein | `"in"` | Einheit für die benutzerdefinierte Größe: `in` oder `mm` |
| keepOrientation | boolean | Nein | `false` | Dreht die Zielgröße passend zur Ausrichtung jeder Seite, statt Breite mal Höhe zu erzwingen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Seiten werden passend skaliert, nie verzerrt. Weicht das Seitenverhältnis ab, bleibt der übrige Platz leer.
- Das Ändern der Größe schneidet nichts zu. Ein Etikett, das auf einem Viertel einer Letter- oder A4-Seite gedruckt ist, füllt auch auf der neuen Seite nur ein Viertel.
- Benutzerdefinierte Größen müssen pro Seite 0,5 bis 200 in (12,7 bis 5080 mm) betragen.
- Hat eine Seite eine Crop Box, wird die Größe von dieser aus geändert, sodass eine zugeschnittene Seite nur den zugeschnittenen Bereich behält.
