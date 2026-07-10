---
description: "Gere uma visualização de forma de onda como imagem PNG a partir de um arquivo de áudio."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 5c771b545e76
---

# Imagem de Forma de Onda {#waveform-image}

Gere uma visualização de forma de onda como imagem PNG a partir de um arquivo de áudio, com dimensões e cor configuráveis.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Não | `1024` | Largura da imagem em pixels (256 a 3840) |
| height | integer | Não | `256` | Altura da imagem em pixels (64 a 1080) |
| color | string | Não | `"#4f46e5"` | Cor hexadecimal da forma de onda (ex.: `"#4f46e5"`) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notas {#notes}

- A saída é sempre uma imagem PNG, independentemente do formato de áudio de entrada.
- A forma de onda é renderizada sobre um fundo transparente.
- Útil para miniaturas, prévias em redes sociais ou incorporação em páginas web.
