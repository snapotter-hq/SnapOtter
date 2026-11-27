---
description: "Ritaglia una sezione da un file audio specificando l'ora di inizio e di fine."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 7ddbc1df21b9
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Ritaglia una sezione da un file audio. Puoi mantenere la parte tra un'ora di inizio e una di fine, oppure tagliare una quantità fissa all'inizio e alla fine.

Nell'app i campi dell'ora accettano secondi semplici (`90`), `MM:SS` (`1:30`) o `HH:MM:SS` (`1:02:03.5`). L'API accetta i secondi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Accetta dati form multipart con un file audio e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` mantiene da `startS` a `endS`. `ends` rimuove `cutStartS` dall'inizio e `cutEndS` dalla fine |
| startS | number | No | `0` | Modalità range: ora di inizio in secondi (minimo 0) |
| endS | number | Range mode | - | Modalità range: ora di fine in secondi (deve essere dopo l'inizio) |
| cutStartS | number | No | `0` | Modalità ends: secondi da rimuovere dall'inizio |
| cutEndS | number | No | `0` | Modalità ends: secondi da rimuovere dalla fine |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Taglia i primi 2 secondi e gli ultimi 3 secondi, qualunque sia la durata del file:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Gli orari sono specificati in secondi e possono includere decimali (ad esempio `10.5`).
- In modalità range, `endS` deve essere maggiore di `startS`. Se `endS` supera la durata dell'audio, il file viene ritagliato fino alla fine.
- In modalità ends, almeno uno tra `cutStartS` e `cutEndS` deve essere maggiore di zero e insieme devono lasciare almeno 0,1 secondi di audio. Poiché il taglio è misurato sulla durata di ciascun file, un'unica impostazione funziona su un batch di file di durata diversa.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A e gli input non supportati per la sola decodifica ricadono su MP3.
