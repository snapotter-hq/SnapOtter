---
description: "Ritaglia una clip da un video specificando gli orari di inizio e fine."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 52aeb98b2547
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Ritaglia una clip da un video. Puoi tenere la parte tra un orario di inizio e uno di fine, oppure tagliare una quantità fissa dall'inizio e dalla fine. È disponibile un'opzione per tagli precisi al fotogramma.

Nell'app, i campi del tempo accettano secondi semplici (`90`), `MM:SS` (`1:30`) o `HH:MM:SS` (`1:02:03.5`). L'API accetta secondi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Accetta dati form multipart con un file video e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` mantiene da `startS` a `endS`. `ends` rimuove `cutStartS` dall'inizio e `cutEndS` dalla fine |
| startS | number | No | `0` | Range mode: orario di inizio in secondi (deve essere >= 0) |
| endS | number | Range mode | - | Range mode: orario di fine in secondi (deve essere successivo a startS) |
| cutStartS | number | No | `0` | Ends mode: secondi da rimuovere dall'inizio |
| cutEndS | number | No | `0` | Ends mode: secondi da rimuovere dalla fine |
| precise | boolean | No | `false` | Ricodifica l'intero intervallo per avere fotogrammi iniziale e finale esatti, invece di copiare dal keyframe successivo |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Taglia i primi 5 secondi e gli ultimi 10 secondi, qualunque sia la durata del video:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Quando `precise` è `false` (il valore predefinito), la clip parte esattamente dal fotogramma richiesto. Solo i fotogrammi tra quel punto di inizio e il keyframe successivo vengono ricodificati e il resto viene copiato, quindi resta veloce. La fine può durare un fotogramma o poco più, perché uno stream copiato conserva i fotogrammi da cui dipendono quelli precedenti. Le sorgenti che non si possono unire in sicurezza (H.264 a 10 bit o interlacciato, altri codec che richiedono un inizio ricodificato, oppure file AVI, FLV, MPEG e TS) vengono invece ricodificate per intero.
- Impostare `precise` su `true` ricodifica sempre l'intero intervallo, quindi entrambe le estremità sono esatte, ma richiede più tempo.
- In range mode, `endS` deve essere maggiore di `startS`. Se `endS` supera la fine del video, la clip arriva fino alla fine.
- In ends mode, almeno uno tra `cutStartS` e `cutEndS` deve essere maggiore di zero e insieme devono lasciare una parte del video. Poiché il taglio si misura sulla durata di ogni file, un'unica impostazione funziona su un batch di video con durate diverse.
