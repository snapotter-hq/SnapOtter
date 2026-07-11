---
description: "Accelera o rallenta la riproduzione audio con un moltiplicatore."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 825a567c411c
---

# Velocità audio {#audio-speed}

Accelera o rallenta la riproduzione audio applicando un moltiplicatore di velocità.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Accetta dati di form multipart con un file audio e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | Moltiplicatore di velocità (da 0.25 a 4). Valori inferiori a 1 rallentano; superiori a 1 accelerano. |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Note {#notes}

- Un fattore di `0.25` riproduce a un quarto della velocità (4 volte più lungo). Un fattore di `4` riproduce a velocità quadrupla (4 volte più corto).
- L'intonazione viene preservata mentre la velocità cambia (time-stretch). Usa il pitch-shift per regolare l'intonazione in modo indipendente.
- L'output di solito mantiene il container di input. L'input AAC viene scritto come M4A, e gli input decodificabili solo in lettura non supportati ricadono su MP3.
