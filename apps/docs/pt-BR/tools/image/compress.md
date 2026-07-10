---
description: "Reduza o tamanho do arquivo de imagem por nível de qualidade ou para um tamanho de arquivo alvo."
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 7f0e414f0a32
---

# Comprimir {#compress}

Reduza o tamanho do arquivo de imagem especificando um nível de qualidade ou um tamanho de arquivo alvo em kilobytes. A ferramenta usa busca binária iterativa para atingir os tamanhos alvo com precisão.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/compress`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `"quality"` | Modo de compressão: `quality` ou `targetSize` |
| quality | number | Não | `80` | Nível de qualidade (1-100). Usado quando o modo é `quality`. |
| targetSizeKb | number | Não | - | Tamanho de arquivo alvo em kilobytes. Usado quando o modo é `targetSize`. |

## Exemplo de Requisição {#example-request}

Comprimir para qualidade 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimir para um tamanho alvo de 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notas {#notes}

- No modo `quality`, valores menores produzem arquivos menores com mais artefatos de compressão. Um valor de 80 é um bom padrão para uso na web.
- No modo `targetSize`, o mecanismo realiza compressão iterativa para chegar o mais perto possível do alvo sem excedê-lo.
- O formato de saída corresponde ao formato de entrada. A compressão se aplica à codificação nativa do formato (por exemplo, qualidade JPEG para arquivos JPEG, qualidade WebP para arquivos WebP).
- Se a qualidade padrão (80) for aceitável, você pode omitir o parâmetro `quality` inteiramente.
