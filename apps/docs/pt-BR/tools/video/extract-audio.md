---
description: "Extrai a faixa de áudio de um vídeo."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 1607d7553340
---

# Extract Audio {#extract-audio}

Extrai a faixa de áudio de um arquivo de vídeo e a salva como MP3, WAV, M4A ou OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"mp3"` | Formato de áudio de saída: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Se o vídeo não tiver faixa de áudio, a requisição retorna um erro 400.
- MP3 tem perdas, mas é amplamente compatível. WAV não tem perdas, mas é grande. M4A (AAC) oferece um bom equilíbrio entre qualidade e tamanho. OGG está disponível para fluxos de trabalho com codecs abertos.
- Quando o áudio de origem já é AAC e o formato de saída é M4A, o stream de áudio é copiado sem recodificação.
