---
description: "Veja metadados detalhados da imagem, propriedades e estatísticas de histograma por canal."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 1773326fc536
---

# Info da Imagem {#image-info}

Ferramenta de análise somente leitura que retorna metadados abrangentes da imagem, incluindo dimensões, formato, espaço de cor, presença de EXIF/ICC/XMP e estatísticas de histograma por canal. Não produz um arquivo de saída processado.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/info`

Aceita dados de formulário multipart com um arquivo de imagem. Nenhum campo de configuração é necessário.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Basta enviar o arquivo de imagem.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|----------|-------------|
| file | file | Sim | A imagem a analisar |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exemplo de Resposta {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Campos da Resposta {#response-fields}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| filename | string | Nome do arquivo sanitizado |
| fileSize | number | Tamanho do arquivo em bytes |
| width | number | Largura da imagem em pixels |
| height | number | Altura da imagem em pixels |
| format | string | Formato detectado (jpeg, png, webp, etc.) |
| channels | number | Número de canais de cor |
| hasAlpha | boolean | Se a imagem tem um canal alfa |
| colorSpace | string | Espaço de cor (srgb, cmyk, etc.) |
| density | number ou null | Resolução DPI/PPI |
| isProgressive | boolean | Se o JPEG usa codificação progressiva |
| orientation | number ou null | Valor de orientação EXIF (1-8) |
| hasProfile | boolean | Se um perfil ICC está incorporado |
| hasExif | boolean | Se há metadados EXIF presentes |
| hasIcc | boolean | Se um perfil de cor ICC está presente |
| hasXmp | boolean | Se há metadados XMP presentes |
| bitDepth | string ou null | Bits por amostra |
| pages | number | Número de páginas (para formatos com várias páginas como TIFF, GIF) |
| histogram | array | Estatísticas por canal (mínimo, máximo, média, desvio padrão) |

## Observações {#notes}

- Este é um endpoint somente leitura. Ele não produz um arquivo de saída baixável nem um `jobId`.
- Para imagens em formato RAW (DNG, CR2, NEF, ARW, etc.), o ExifTool é usado para extrair as dimensões reais do sensor e os sinalizadores de metadados que o Sharp não consegue ler diretamente.
- Arquivos HEIC/HEIF são decodificados para PNG internamente para extrair as estatísticas de pixels, já que o Sharp não consegue decodificar pixels HEVC.
- O histograma fornece mínimo/máximo/média/desvio padrão por canal, não uma distribuição completa de 256 bins.
- O campo `density` reflete os metadados de DPI incorporados, se presentes.
