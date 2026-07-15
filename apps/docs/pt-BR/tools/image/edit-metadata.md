---
description: "Edite campos de metadados EXIF, IPTC, GPS e XMP em imagens sem recodificar os pixels."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: c656f50e4320
---

# Editar Metadados da Imagem {#edit-metadata}

Edite campos de metadados de imagem, incluindo EXIF, IPTC, coordenadas GPS, datas e palavras-chave. Usa o ExifTool internamente, então os metadados são gravados no local sem recodificar os pixels, preservando a qualidade total da imagem.

## Endpoints da API {#api-endpoints}

### Editar Metadados {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Grava campos de metadados na imagem e retorna o arquivo modificado.

### Inspecionar Metadados {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Retorna os metadados completos da imagem via ExifTool como JSON. Não modifica a imagem.

## Parâmetros (Editar) {#parameters-edit}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| title | string | Não | - | Título da imagem (XMP/EXIF) |
| author | string | Não | - | Nome do autor |
| artist | string | Não | - | Nome do artista (tag Artist do EXIF) |
| copyright | string | Não | - | Aviso de copyright |
| imageDescription | string | Não | - | Descrição da imagem (EXIF) |
| software | string | Não | - | Tag de software |
| dateTime | string | Não | - | Valor DateTime do EXIF |
| dateTimeOriginal | string | Não | - | Valor DateTimeOriginal do EXIF |
| setAllDates | string | Não | - | Define todos os campos de data de uma vez |
| dateShift | string | Não | - | Desloca todas as datas por um deslocamento (formato: `+HH:MM` ou `-HH:MM`) |
| clearGps | boolean | Não | `false` | Remove todos os dados de GPS |
| gpsLatitude | number | Não | - | Define a latitude GPS (-90 a 90) |
| gpsLongitude | number | Não | - | Define a longitude GPS (-180 a 180) |
| gpsAltitude | number | Não | - | Define a altitude GPS em metros |
| keywords | string[] | Não | - | Palavras-chave/tags a adicionar ou definir |
| keywordsMode | string | Não | `"add"` | Como tratar as palavras-chave: `add` (anexar) ou `set` (substituir) |
| fieldsToRemove | string[] | Não | `[]` | Lista de nomes de campos de metadados específicos a remover |
| iptcTitle | string | Não | - | Nome do Objeto IPTC |
| iptcHeadline | string | Não | - | Manchete IPTC |
| iptcCity | string | Não | - | Cidade IPTC |
| iptcState | string | Não | - | Província/Estado IPTC |
| iptcCountry | string | Não | - | País IPTC |

## Exemplo de Requisição {#example-request}

Definir autor e copyright:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Definir coordenadas GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Remover GPS e adicionar palavras-chave:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Inspecionar metadados:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exemplo de Resposta (Editar) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notas {#notes}

- Esta ferramenta requer que o ExifTool esteja instalado no servidor. Ele está incluído na imagem Docker.
- Os metadados são gravados no local, então nenhuma recodificação de pixels ocorre. A mudança no tamanho do arquivo é mínima (apenas os bytes de metadados).
- O parâmetro `dateShift` desloca todos os campos de data pelo deslocamento especificado, útil para corrigir erros de fuso horário (por exemplo, `+02:00` ou `-05:30`).
- Se nenhuma alteração for solicitada (todos os parâmetros omitidos ou vazios), o arquivo original é retornado inalterado.
- Formatos suportados: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Para formatos não pré-visualizáveis no navegador (HEIF, TIFF), a resposta inclui um campo `previewUrl` com uma pré-visualização WebP.
