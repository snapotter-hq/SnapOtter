---
description: "Extrai quadros de um vídeo como um ZIP de imagens."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: a95eac37937c
---

# Video to Frames {#video-to-frames}

Extrai quadros individuais de um vídeo e os baixa como um arquivo ZIP de imagens PNG ou JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `"all"` | Modo de extração: `all`, `nth`, `timestamps` |
| n | integer | Não | `10` | Extrai a cada N-ésimo quadro (2-1000). Usado apenas quando o modo é `"nth"` |
| timestamps | string | Não | `""` | Carimbos de tempo em segundos separados por vírgula. Obrigatório quando o modo é `"timestamps"` |
| format | string | Não | `"png"` | Formato de imagem para os quadros extraídos: `png`, `jpg` |

## Example Request {#example-request}

Extrair a cada 30º quadro como JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Extrair quadros em carimbos de tempo específicos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- O modo `all` extrai cada quadro e pode produzir arquivos ZIP muito grandes para vídeos longos. Use o modo `nth` ou `timestamps` para extração seletiva.
- PNG preserva a qualidade total, mas produz arquivos maiores. JPG é menor, mas tem perdas.
- A resposta é baixada como um arquivo ZIP contendo arquivos de imagem numerados sequencialmente.
