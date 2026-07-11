---
description: "Converta imagens em data URIs base64 para incorporar em HTML, CSS e outros."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 9a839ef94b10
---

# Imagem para Base64 {#image-to-base64}

Converta uma ou mais imagens em strings codificadas em base64 e data URIs. Suporta conversão de formato opcional, controle de qualidade e redimensionamento. Útil para incorporar imagens diretamente em HTML, CSS, JSON ou modelos de e-mail.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Aceita dados de formulário multipart com um ou mais arquivos de imagem e um campo JSON `settings` opcional.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Não | `"original"` | Converter antes de codificar: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Não | `80` | Qualidade de saída para formatos com perdas (1 a 100) |
| maxWidth | number | Não | `0` | Largura máxima em pixels (0 = sem redimensionamento, não aumentará) |
| maxHeight | number | Não | `0` | Altura máxima em pixels (0 = sem redimensionamento, não aumentará) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Vários arquivos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Campos da Resposta {#response-fields}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| results | array | Imagens convertidas com sucesso |
| errors | array | Imagens que falharam ao processar (com nome do arquivo e mensagem de erro) |

### Objeto de Resultado {#result-object}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| filename | string | Nome original do arquivo |
| mimeType | string | Tipo MIME da saída codificada |
| width | number | Largura final em pixels (após qualquer redimensionamento) |
| height | number | Altura final em pixels (após qualquer redimensionamento) |
| originalSize | number | Tamanho original do arquivo em bytes |
| encodedSize | number | Tamanho da string base64 em bytes |
| overheadPercent | number | Diferença percentual de tamanho em relação ao original (positivo = maior, negativo = menor) |
| base64 | string | Dados brutos da imagem codificados em base64 |
| dataUri | string | Data URI completo pronto para uso em atributos `src` |

## Observações {#notes}

- A codificação base64 normalmente aumenta o tamanho em aproximadamente 33% em relação ao arquivo binário. O campo `overheadPercent` mostra a diferença real.
- Quando `outputFormat` é `"original"`, arquivos HEIC/HEIF são convertidos para JPEG (já que os navegadores não conseguem exibir HEIC em data URIs).
- As opções `maxWidth` e `maxHeight` redimensionam usando `fit: inside` com `withoutEnlargement`, então imagens menores que as dimensões especificadas não são ampliadas.
- Vários arquivos podem ser processados em uma única requisição. Cada arquivo é processado de forma independente, e falhas não impedem que os outros arquivos tenham sucesso.
- Arquivos SVG são repassados como `image/svg+xml` sem recodificação (a menos que uma conversão de formato seja solicitada).
- Este é um endpoint somente leitura. Ele não produz um arquivo baixável nem um `jobId`. Os dados em base64 são retornados diretamente no corpo da resposta.
