---
description: "Konvertiert zwischen PowerPoint- und OpenDocument-Präsentationsformaten."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 7c7dc5cd3311
---

# Convert Presentation {#convert-presentation}

Konvertiert Präsentationen zwischen den Formaten PowerPoint (PPTX) und OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Akzeptiert Multipart-Formulardaten mit einer PowerPoint-/ODP-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Ja | - | Ausgabeformat: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Gibt `202 Accepted` zurück. Verfolge den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akzeptierte Eingabeformate: `.pptx`, `.ppt`, `.odp`.
- Die Konvertierung wird von LibreOffice im Headless-Modus auf dem Server durchgeführt.
- Animationen und Übergangseffekte bleiben zwischen Formaten möglicherweise nicht erhalten.
- Das Ausgabeformat muss sich vom Eingabeformat unterscheiden.
