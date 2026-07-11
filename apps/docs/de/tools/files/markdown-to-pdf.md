---
description: "Eine Markdown-Datei in ein formatiertes PDF umwandeln."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 2c4c1e256e6a
---

# Markdown zu PDF {#markdown-to-pdf}

Wandelt eine Markdown-Datei in ein formatiertes PDF-Dokument um. Aus Datenschutzgründen sind entfernte Ressourcen deaktiviert.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Nimmt Multipart-Formulardaten mit einer Markdown-Datei entgegen.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie eine Markdown-Datei hoch, und sie wird in ein PDF umgewandelt.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Beispielantwort {#example-response}

Gibt `202 Accepted` zurück. Verfolgen Sie den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Hinweise {#notes}

- Akzeptierte Eingabeformate: `.md`, `.markdown`.
- Aus Datenschutz- und Sicherheitsgründen werden entfernte Ressourcen (über URLs referenzierte Bilder, Stylesheets) nicht abgerufen.
- Das Markdown wird zunächst in HTML gerendert und anschließend über WeasyPrint in ein PDF umgewandelt.
- Codeblöcke, Tabellen und andere Markdown-Elemente werden in der PDF-Ausgabe formatiert.
