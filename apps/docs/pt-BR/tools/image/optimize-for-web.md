---
description: "Otimize imagens para entrega na web com conversão de formato, controle de qualidade, redimensionamento e remoção de metadados."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 2175c8054b3b
---

# Otimizar para Web {#optimize-for-web}

Otimize imagens para entrega na web em uma única etapa. Combina conversão de formato, ajuste de qualidade, redimensionamento opcional, codificação progressiva e remoção de metadados.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

Também há um endpoint de pré-visualização ao vivo disponível em `POST /api/v1/tools/image/optimize-for-web/preview`, que retorna a imagem processada diretamente como binário (sem criação de workspace) para ajuste de parâmetros em tempo real.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `"webp"` | Formato de saída: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Não | `80` | Qualidade de saída (1-100) |
| maxWidth | number | Não | - | Largura máxima em pixels. A imagem é reduzida se for mais larga. |
| maxHeight | number | Não | - | Altura máxima em pixels. A imagem é reduzida se for mais alta. |
| progressive | boolean | Não | `true` | Ativar codificação progressiva/entrelaçada |
| stripMetadata | boolean | Não | `true` | Remover metadados EXIF, GPS, ICC e XMP |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Otimizar para AVIF com compressão agressiva:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Resposta do Endpoint de Pré-visualização {#preview-endpoint-response}

O endpoint de pré-visualização (`/api/v1/tools/image/optimize-for-web/preview`) retorna a imagem binária diretamente, com cabeçalhos informativos:

- `X-Original-Size` - Tamanho do arquivo original em bytes
- `X-Processed-Size` - Tamanho do arquivo processado em bytes
- `X-Output-Filename` - Nome do arquivo de saída codificado para URL

## Notas {#notes}

- Esta ferramenta foi projetada como um pipeline de otimização completo para ativos da web. Ela cuida da conversão de formato, ajuste de qualidade, limitação de dimensões máximas e remoção de metadados em uma única passagem.
- A extensão do nome do arquivo de saída é atualizada para corresponder ao formato escolhido.
- A codificação JXL (JPEG XL) usa um codificador CLI especializado. A imagem é primeiro processada como PNG e depois codificada para JXL.
- A codificação progressiva melhora o tempo de carregamento percebido para JPEG e PNG, permitindo que os navegadores renderizem uma pré-visualização de baixa qualidade antes que a imagem completa seja carregada.
- O endpoint de pré-visualização é mais leve (sem criação de workspace/job) e destina-se à interface de ajuste de parâmetros ao vivo do frontend.
