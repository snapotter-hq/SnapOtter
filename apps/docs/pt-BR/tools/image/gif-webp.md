---
description: "Converta GIF animado para WebP e vice-versa, preservando todos os quadros."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: d3a5dda364a8
---

# Conversor GIF/WebP {#gif-webp-converter}

Converta arquivos GIF animados para WebP e vice-versa, preservando todos os quadros e a temporização da animação. As animações WebP costumam ser 25-35% menores do que os GIFs equivalentes.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Aceita dados de formulário multipart com um arquivo GIF ou WebP e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| quality | integer | Não | `80` | Qualidade de saída para a codificação WebP (1-100) |
| lossless | boolean | Não | `false` | Usar compressão WebP sem perdas |
| resizePercent | integer | Não | `100` | Escalar a saída por percentual (10-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Observações {#notes}

- Apenas arquivos `.gif` e `.webp` são aceitos. Outros formatos de imagem não são suportados por esta ferramenta.
- A direção da conversão é automática: entrada GIF produz saída WebP, e entrada WebP produz saída GIF.
- As opções `quality` e `lossless` se aplicam apenas ao codificar para WebP. Ao converter para GIF, a saída usa a paleta GIF padrão.
- Use `resizePercent` para reduzir as dimensões (e o tamanho do arquivo) de animações grandes.
