---
description: "Aumenta la nitidezza delle immagini con metodi adattivo, maschera di contrasto o passa-alto, con riduzione del rumore opzionale."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: 6d9118872bed
---

# Nitidezza {#sharpening}

Strumento avanzato per la nitidezza con tre metodi: adattivo (intelligente, sensibile ai bordi), maschera di contrasto (raggio/quantità classici) e passa-alto (enfasi sulla texture). Include una riduzione del rumore integrata per prevenire artefatti dovuti alla nitidezza.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | Algoritmo di nitidezza: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | Adattivo: sigma gaussiana (da 0.5 a 10) |
| m1 | number | No | `1.0` | Adattivo: nitidezza delle aree piatte (da 0 a 10) |
| m2 | number | No | `3.0` | Adattivo: nitidezza delle aree frastagliate (da 0 a 20) |
| x1 | number | No | `2.0` | Adattivo: soglia piatto/frastagliato (da 0 a 10) |
| y2 | number | No | `12` | Adattivo: nitidezza massima delle aree piatte (da 0 a 50) |
| y3 | number | No | `20` | Adattivo: nitidezza massima delle aree frastagliate (da 0 a 50) |
| amount | number | No | `100` | Maschera di contrasto: quantità di nitidezza (da 0 a 1000) |
| radius | number | No | `1.0` | Maschera di contrasto: raggio di sfocatura in pixel (da 0.1 a 5) |
| threshold | number | No | `0` | Maschera di contrasto: differenza minima di luminosità per applicare la nitidezza (da 0 a 255) |
| strength | number | No | `50` | Passa-alto: intensità del filtro (da 0 a 100) |
| kernelSize | number | No | `3` | Passa-alto: dimensione del kernel di convoluzione (3 o 5) |
| denoise | string | No | `"off"` | Riduzione del rumore prima della nitidezza: `off`, `light`, `medium`, `strong` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Maschera di contrasto con soglia per proteggere le aree uniformi:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Note {#notes}

- Vengono usati solo i parametri pertinenti al metodo scelto. Per esempio, `amount`, `radius` e `threshold` vengono ignorati quando `method` è `adaptive`.
- Il metodo adattivo usa la nitidezza adattiva integrata di Sharp con comportamento configurabile per le aree piatte/frastagliate.
- L'opzione `denoise` applica la riduzione del rumore prima della nitidezza per evitare l'amplificazione di rumore/grana.
- La nitidezza passa-alto estrae i dettagli fini sottraendo una versione sfocata dall'originale, per poi riunire il risultato.
- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
