---
description: "Hochgeladene Signaturbilder mit normalisierten Seitenplatzierungen auf eine PDF stempeln."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: ed372ab0c6a8
---

# PDF signieren {#sign-pdf}

Stempeln Sie eine oder mehrere hochgeladene Signatur-PNG-Bilder auf eine beliebige Seite einer PDF. Diese Route verwendet einen benutzerdefinierten Multipart-Vertrag, da sie die PDF, ein oder mehrere Signaturbilder und Platzierungskoordinaten benötigt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Akzeptiert Multipart-Formulardaten. Die PDF wird als `file` gesendet; Signaturen werden als `sig0`, `sig1` usw. gesendet; Platzierungen werden in einem JSON-Feld `placements` gesendet.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Zu signierende PDF-Datei |
| sig0 | file | Ja | - | Erstes Signaturbild. Weitere Bilder verwenden `sig1`, `sig2` usw. |
| placements | JSON string | Ja | - | Array von Platzierungsobjekten: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Nein | - | Optionale UUID zur Fortschrittsverfolgung über SSE |
| fileId | string | Nein | - | Optionale Dateibibliotheks-ID, um das signierte Ergebnis als neue Version zu speichern |

## Placement Coordinates {#placement-coordinates}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| sig | integer | Index des Signaturbilds. `0` wird auf `sig0` abgebildet |
| page | integer | Nullbasierter PDF-Seitenindex |
| x | number | Linke Position als Seitenbruchteil |
| y | number | Obere Position als Seitenbruchteil |
| w | number | Signaturbreite als Seitenbruchteil |
| h | number | Signaturhöhe als Seitenbruchteil |

Koordinaten verwenden einen Ursprung oben links. Werte können geringfügig über den Seitenrand hinausragen; der PDF-Renderer beschneidet den endgültigen Stempel auf die Seite.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Wenn die Anfrage nicht innerhalb des synchronen Wartefensters abgeschlossen werden kann, gibt die API Folgendes zurück:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Verbinden Sie sich mit `/api/v1/jobs/<jobId>/progress` und laden Sie das Ergebnis herunter, wenn der Job abgeschlossen ist.

## Notes {#notes}

- Akzeptiertes PDF-Eingabeformat: `.pdf`.
- Signaturbilder müssen gültige Bilddateien sein, typischerweise PNG mit Transparenz.
- Es werden bis zu 100 Signaturbilder und 100 Platzierungen akzeptiert.
- `sign-pdf` ist eine benutzerdefinierte Route und verwendet nicht das standardmäßige JSON-Feld `settings` des Tools.
