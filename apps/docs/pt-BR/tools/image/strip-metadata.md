---
description: "Remove metadados EXIF, GPS, ICC e XMP de imagens para privacidade e arquivos menores."
i18n_source_hash: e89147734fd0
i18n_provenance: human
i18n_output_hash: 1183378e41c2
---

# Remover Metadados {#remove-metadata}

Remove metadados EXIF, GPS, perfis de cor ICC e metadados XMP de imagens. Útil para privacidade (remoção de coordenadas GPS, informações da câmera) e para reduzir o tamanho do arquivo.

## Endpoints da API {#api-endpoints}

### Remover Metadados {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Processa a imagem e retorna uma versão limpa com os metadados selecionados removidos.

### Inspecionar Metadados {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Retorna os metadados analisados como JSON sem modificar a imagem. Útil para pré-visualizar quais metadados existem antes de removê-los.

## Parâmetros (Remoção) {#parameters-strip}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Não | `false` | Remove dados EXIF (configurações da câmera, datas etc.) |
| stripGps | boolean | Não | `false` | Remove apenas os dados de GPS/localização |
| stripIcc | boolean | Não | `false` | Remove o perfil de cor ICC |
| stripXmp | boolean | Não | `false` | Remove metadados XMP (Adobe, IPTC) |
| stripAll | boolean | Não | `true` | Remove todos os metadados de uma vez |

Quando `stripAll` é `true`, ele sobrepõe as flags individuais e remove tudo.

## Exemplo de Requisição {#example-request}

Remover todos os metadados:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Remover apenas os dados de GPS (mantendo as informações da câmera e o perfil de cor):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Inspecionar metadados sem modificar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exemplo de Resposta (Remoção) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Exemplo de Resposta (Inspeção) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notas {#notes}

- A imagem é recodificada em seu formato original após a remoção. JPEG usa mozjpeg com qualidade 90, PNG usa nível de compressão 9, WebP usa qualidade 85.
- Remover perfis ICC pode causar mudanças sutis de cor se a imagem estiver marcada com um perfil não sRGB. Use `stripIcc: false` se a precisão de cor for importante.
- O endpoint de inspeção analisa as coordenadas GPS em valores decimais de latitude/longitude (prefixados com underscore) para maior conveniência.
- Formatos de entrada suportados: JPEG, PNG, WebP, AVIF, TIFF, GIF.
