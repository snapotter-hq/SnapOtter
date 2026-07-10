---
description: "Aplique um efeito de pixelização à imagem inteira ou a uma região específica."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 7b41e0256522
---

# Pixelizar {#pixelate}

Aplique um efeito de pixelização a uma imagem inteira ou a uma região retangular específica. Útil para ocultar conteúdo sensível como rostos, placas de veículos ou informações pessoais.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Não | `12` | Tamanho do bloco de pixels (2-128); valores maiores produzem pixelização mais grosseira |
| region | object | Não | - | Restringe a pixelização a um retângulo (veja abaixo) |

### Objeto Region {#region-object}

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|----------|-------------|
| left | integer | Sim | Deslocamento à esquerda em pixels (>= 0) |
| top | integer | Sim | Deslocamento no topo em pixels (>= 0) |
| width | integer | Sim | Largura da região em pixels (>= 1) |
| height | integer | Sim | Altura da região em pixels (>= 1) |

## Exemplo de Requisição {#example-request}

Pixelizar a imagem inteira:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixelizar uma região específica:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notas {#notes}

- Quando `region` é omitido, a imagem inteira é pixelizada.
- As coordenadas da região estão em pixels relativos ao canto superior esquerdo da imagem. A região deve estar dentro dos limites da imagem.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
