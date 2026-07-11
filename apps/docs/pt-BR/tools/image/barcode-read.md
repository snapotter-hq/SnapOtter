---
description: "Escaneie imagens em busca de QR codes, códigos de barras e códigos 2D com saída anotada."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: c934653c0c44
---

# Leitor de Código de Barras {#barcode-reader}

Escaneie imagens enviadas em busca de todos os tipos de códigos de barras e QR codes. Retorna o texto decodificado, o tipo de código de barras e dados de posição para cada código detectado. Também gera uma imagem anotada com caixas delimitadoras coloridas ao redor dos códigos detectados.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings` opcional.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Não | `true` | Ativa o modo de varredura agressiva para códigos de barras mais difíceis de ler (mais lento, mas mais completo) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Campos da Resposta {#response-fields}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| filename | string | Nome do arquivo original |
| barcodes | array | Array de objetos de código de barras detectados |
| annotatedUrl | string ou null | URL para baixar a imagem anotada (null se nenhum código de barras for encontrado) |
| previewUrl | string ou null | Igual a annotatedUrl (para compatibilidade de pré-visualização no frontend) |

### Objeto de Código de Barras {#barcode-object}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| type | string | Formato do código de barras (QRCode, EAN-13, Code128, DataMatrix, PDF417, etc.) |
| text | string | Conteúdo decodificado do código de barras |
| position | object | Caixa delimitadora com as coordenadas topLeft, topRight, bottomLeft, bottomRight |

## Tipos de Código de Barras Suportados {#supported-barcode-types}

Códigos de barras 1D: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Códigos de barras 2D: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Observações {#notes}

- Usa a biblioteca zxing-wasm para detecção de código de barras.
- A imagem anotada sobrepõe caixas delimitadoras poligonais coloridas e rótulos numerados em cada código de barras detectado.
- Até 255 códigos de barras podem ser detectados em uma única imagem.
- Se nenhum código de barras for encontrado, `barcodes` é um array vazio e `annotatedUrl` é null.
- O modo `tryHarder` realiza uma varredura mais completa ao custo de tempo de processamento. Desative-o para um processamento mais rápido de códigos de barras limpos e bem alinhados.
- A saída anotada está sempre no formato PNG.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes da varredura.
- A orientação EXIF é aplicada automaticamente antes do processamento.
