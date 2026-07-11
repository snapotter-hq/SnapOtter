---
description: "Die Audiospur eines Videos durch eine andere Datei ersetzen."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: a166fd66890e
---

# Replace Audio {#replace-audio}

Die Audiospur eines Videos durch eine Audiodatei ersetzen. Laden Sie sowohl ein Video als auch eine Audiodatei hoch.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Nimmt Multipart-Formulardaten mit genau zwei Dateien entgegen: einer Videodatei, gefolgt von einer Audiodatei.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie eine Videodatei und eine Audiodatei als zwei `file`-Teile hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Es müssen genau zwei Dateien hochgeladen werden: Die erste muss ein Video sein, die zweite eine Audiodatei.
- Wenn die Audiodatei länger als das Video ist, wird sie auf die Videodauer gekürzt. Ist sie kürzer, läuft das verbleibende Video ohne Ton.
- Der Videostream wird ohne Neukodierung kopiert, sodass kein Videoqualitätsverlust auftritt.
