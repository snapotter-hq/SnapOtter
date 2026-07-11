---
description: "Estrae in sicurezza i file da un archivio ZIP con protezione dalle bomb."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 57ab1d28803f
---

# Extract ZIP {#extract-zip}

Estrae in sicurezza i file da un archivio ZIP. Gli archivi con un solo file restituiscono direttamente il file contenuto; gli archivi con più file restituiscono uno ZIP piatto con i contenuti estratti.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Accetta dati form multipart con un file ZIP. Non è richiesto alcun campo settings.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un file `.zip` da estrarre.

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

- Come input sono accettati solo file `.zip`.
- Se l'archivio contiene un solo file, quel file viene restituito direttamente (non racchiuso in uno ZIP).
- Se l'archivio contiene più file, viene restituito uno ZIP piatto con tutti i file estratti al livello radice (la struttura delle directory annidate viene appiattita).
- La protezione integrata dalle bomb rifiuta gli archivi con rapporti di compressione o conteggi di file eccessivi per prevenire l'esaurimento delle risorse.
