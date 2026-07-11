---
description: "Extrahiert Dateien sicher aus einem ZIP-Archiv mit Schutz vor ZIP-Bomben."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: cbe8d2261f96
---

# Extract ZIP {#extract-zip}

Extrahiert Dateien sicher aus einem ZIP-Archiv. Archive mit einer einzelnen Datei geben die enthaltene Datei direkt zurück; Archive mit mehreren Dateien geben ein flaches ZIP mit den extrahierten Inhalten zurück.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Akzeptiert Multipart-Formulardaten mit einer ZIP-Datei. Es ist kein Einstellungsfeld erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Lade eine `.zip`-Datei zum Extrahieren hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Nur `.zip`-Dateien werden als Eingabe akzeptiert.
- Wenn das Archiv eine einzelne Datei enthält, wird diese Datei direkt zurückgegeben (nicht in ein ZIP verpackt).
- Wenn das Archiv mehrere Dateien enthält, wird ein flaches ZIP zurückgegeben, in dem alle Dateien auf die Wurzelebene extrahiert werden (die verschachtelte Verzeichnisstruktur wird abgeflacht).
- Der integrierte Schutz vor ZIP-Bomben lehnt Archive mit übermäßigen Komprimierungsverhältnissen oder Dateianzahlen ab, um Ressourcenerschöpfung zu verhindern.
