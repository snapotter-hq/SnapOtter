---
description: "Eine PDF in Markdown umwandeln, wobei Überschriften, Listen und Tabellen erhalten bleiben, sofern die PDF sie enthält."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: a24e543e25f3
i18n_hash_version: 2
---

# PDF zu Markdown {#pdf-to-markdown}

Wandeln Sie eine PDF in eine Markdown-Datei um, die Sie in ein Wiki, eine statische Website oder eine LLM-Pipeline übernehmen können.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei.

## Parameters {#parameters}

Dieses Tool hat keine konfigurierbaren Parameter. Laden Sie eine PDF hoch und erhalten Sie eine `.md`-Datei zurück.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Eine große PDF kann länger als das synchrone Zeitfenster dauern. Die API antwortet dann mit `202` und einer `jobId`, und Sie verfolgen den Fortschritt unter `/api/v1/jobs/{jobId}/progress`.

## Was erhalten bleibt {#what-gets-kept}

Eine PDF speichert positionierten Text, keine Struktur, daher leitet der Konverter sie ab:

- **Überschriften.** Kurze Zeilen, die deutlich größer als der Fließtext gesetzt sind, werden zu Überschriften von `#` bis `######`, nach Größe über das gesamte Dokument eingestuft.
- **Listen.** Zeilen, die mit einem Aufzählungszeichen oder einer Zahl beginnen, werden zu Listeneinträgen.
- **Fett, kursiv und Links.** Bleiben inline erhalten. Nur `http`-, `https`- und `mailto`-Links bleiben erhalten.
- **Tabellen.** Mit Linien gezeichnete Tabellen werden zu Markdown-Tabellen. Tabellen, die nur durch Abstände angeordnet sind, kommen meist als einfache Absätze heraus.

Bilder werden verworfen. Mehrspaltige Layouts und ungewöhnliche Seitengestaltungen werden nach bestem Bemühen verarbeitet, prüfen Sie das Ergebnis also, bevor Sie sich darauf verlassen.

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Das Feld `chars` in der Antwort gibt die Länge der Markdown-Ausgabe an.
- Eine gescannte PDF hat keine Textebene, die sich umwandeln ließe. Das Tool lehnt sie mit `422` und dem Code `NO_TEXT_LAYER` ab, statt eine leere Datei zurückzugeben. Verwenden Sie dafür das Tool [PDF OCR](./ocr-pdf).
- Für den Rückweg lesen [Markdown zu PDF](../files/markdown-to-pdf), [Markdown to DOCX](../files/markdown-to-docx) und [Markdown to HTML](../files/markdown-to-html) `.md`-Dateien.
