---
description: "Renomeie vários arquivos usando um modelo de padrão e baixe como ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: e37bffd2121d
---

# Renomear em Lote {#bulk-rename}

Renomeie vários arquivos usando um modelo de padrão com marcadores para índice, índice com preenchimento de zeros e nome de arquivo original. Retorna um arquivo ZIP contendo todos os arquivos renomeados.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Aceita dados de formulário multipart com vários arquivos e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| pattern | string | Não | `"image-{{index}}"` | Padrão de nomeação com marcadores (máx. 1000 caracteres) |
| startIndex | number | Não | `1` | Número do índice inicial |

### Marcadores de Padrão {#pattern-placeholders}

| Marcador | Descrição | Exemplo |
|-------------|-------------|---------|
| `{{index}}` | Número sequencial a partir de `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Número sequencial com preenchimento de zeros | `01`, `02`, `03` |
| `{{original}}` | Nome do arquivo original sem extensão | `photo`, `IMG_001` |

A extensão do arquivo original é sempre preservada.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Isto produz: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Usando o nome do arquivo original:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Isto produz: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Exemplo de Resposta {#example-response}

A resposta é um arquivo ZIP transmitido diretamente (não uma resposta JSON). Os cabeçalhos da resposta são:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Observações {#notes}

- Esta ferramenta não processa imagens. Ela apenas renomeia arquivos e os empacota em um arquivo ZIP.
- A largura do preenchimento de zeros para `{{padded}}` é determinada automaticamente com base no número total de arquivos (por exemplo, 100 arquivos usariam preenchimento de 3 dígitos: `001`, `002`, etc.).
- As extensões de arquivo são preservadas a partir dos nomes de arquivo originais.
- Os nomes de arquivo são higienizados para remover caracteres inseguros.
- Pelo menos um arquivo deve ser fornecido.
