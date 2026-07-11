---
description: "Rinomina più file usando un modello di pattern e li scarica come ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: e89cd776d886
---

# Rinomina in blocco {#bulk-rename}

Rinomina più file usando un modello di pattern con segnaposto per indice, indice con riempimento e nome del file originale. Restituisce un archivio ZIP contenente tutti i file rinominati.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Accetta dati di form multipart con più file e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | Pattern di denominazione con segnaposto (max 1000 caratteri) |
| startIndex | number | No | `1` | Numero di indice iniziale |

### Segnaposto del pattern {#pattern-placeholders}

| Segnaposto | Descrizione | Esempio |
|-------------|-------------|---------|
| `{{index}}` | Numero sequenziale a partire da `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Numero sequenziale con riempimento di zeri | `01`, `02`, `03` |
| `{{original}}` | Nome del file originale senza estensione | `photo`, `IMG_001` |

L'estensione del file originale viene sempre preservata.

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Questo produce: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Usando il nome del file originale:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Questo produce: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Esempio di risposta {#example-response}

La risposta è un file ZIP trasmesso in streaming direttamente (non una risposta JSON). Le intestazioni della risposta sono:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Note {#notes}

- Questo strumento non elabora immagini. Rinomina solo i file e li impacchetta in un archivio ZIP.
- La larghezza del riempimento di zeri per `{{padded}}` viene determinata automaticamente in base al numero totale di file (ad es. 100 file userebbero un riempimento a 3 cifre: `001`, `002`, ecc.).
- Le estensioni dei file vengono preservate dai nomi dei file originali.
- I nomi dei file vengono ripuliti per rimuovere i caratteri non sicuri.
- Deve essere fornito almeno un file.
