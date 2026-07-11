---
description: "Referência das operações do mecanismo de imagem. Todas as operações de processamento de imagem baseadas em Sharp e seus parâmetros."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: b59c814ed63a
---

# Mecanismo de imagem {#image-engine}

O pacote `@snapotter/image-engine` lida com todas as operações de imagem que não são de IA. Ele encapsula o [Sharp](https://sharp.pixelplumbing.com/) e roda inteiramente no próprio processo, sem dependências externas.

## Operações {#operations}

### resize {#resize}

Escala uma imagem para dimensões específicas ou por porcentagem.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `width` | number | Largura alvo em pixels |
| `height` | number | Altura alvo em pixels |
| `fit` | string | `cover`, `contain`, `fill`, `inside` ou `outside` |
| `withoutEnlargement` | boolean | Se verdadeiro, não fará upscale de imagens menores |
| `percentage` | number | Escala por porcentagem em vez de dimensões absolutas |

Você pode definir `width`, `height` ou ambos. Se definir apenas um, o outro é calculado para manter a proporção.

### crop {#crop}

Recorta uma região retangular da imagem.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `left` | number | Deslocamento X a partir da borda esquerda |
| `top` | number | Deslocamento Y a partir da borda superior |
| `width` | number | Largura da área de recorte |
| `height` | number | Altura da área de recorte |
| `unit` | string | `px` (padrão) ou `percent` |

### rotate {#rotate}

Gira a imagem por um ângulo determinado.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `angle` | number | Ângulo de rotação em graus (0-360) |
| `background` | string | Cor de preenchimento para a área exposta (padrão: `#000000`). Aplica-se apenas a ângulos que não sejam de 90 graus. |

### flip {#flip}

Espelha a imagem horizontalmente, verticalmente ou ambos. Pelo menos um deve ser verdadeiro.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `horizontal` | boolean | Espelhar da esquerda para a direita |
| `vertical` | boolean | Espelhar de cima para baixo |

### convert {#convert}

Altera o formato da imagem.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `format` | string | Formato alvo: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Qualidade de compressão (1-100, aplica-se a formatos com perdas) |

Os sete primeiros formatos (de `jpg` a `jxl`) são codificados pelo Sharp no próprio processo. Os formatos restantes usam codificadores externos na camada da API: `heic`/`heif` via heif-enc, `bmp`/`ico` via ImageMagick, `jp2` via opj_compress e `qoi` via um codec TypeScript inline.

### compress {#compress}

Reduz o tamanho do arquivo mantendo o mesmo formato.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `quality` | number | Qualidade alvo (1-100) |
| `targetSizeBytes` | number | Tamanho de arquivo alvo opcional em bytes |
| `format` | string | Substituição de formato opcional |

### strip-metadata {#strip-metadata}

Remove metadados EXIF, IPTC, XMP e ICC da imagem. Sem parâmetros (ou com `stripAll: true`), remove tudo. Passe flags individuais para remoção seletiva.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `stripAll` | boolean | Remove todos os metadados (padrão quando nenhuma flag está definida) |
| `stripExif` | boolean | Remove os dados EXIF (incluindo GPS se `stripGps` não estiver definido separadamente) |
| `stripGps` | boolean | Remove os dados de localização GPS |
| `stripIcc` | boolean | Remove o perfil de cor ICC |
| `stripXmp` | boolean | Remove os metadados XMP |

### Ajustes de cor {#color-adjustments}

Essas operações modificam as propriedades de cor de uma imagem. Cada uma recebe um único valor numérico.

| Operação | Parâmetro | Intervalo | Descrição |
|---|---|---|---|
| `brightness` | `value` | -100 a 100 | Ajustar brilho |
| `contrast` | `value` | -100 a 100 | Ajustar contraste |
| `saturation` | `value` | -100 a 100 | Ajustar saturação de cor |

### Filtros de cor {#color-filters}

Estes aplicam uma transformação de cor fixa. Não recebem parâmetros.

| Operação | Descrição |
|---|---|
| `grayscale` | Converter para escala de cinza |
| `sepia` | Aplicar um tom sépia |
| `invert` | Inverter todas as cores |

### Canais de cor {#color-channels}

Ajusta canais de cor RGB individuais. Os valores são multiplicadores em que 100 = nenhuma alteração.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `red` | number | Multiplicador do canal vermelho (0 a 200, 100 = inalterado) |
| `green` | number | Multiplicador do canal verde (0 a 200, 100 = inalterado) |
| `blue` | number | Multiplicador do canal azul (0 a 200, 100 = inalterado) |

### sharpen {#sharpen}

Afiação simples controlada por um único valor.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `value` | number | Intensidade da afiação (0 a 100). Mapeada para um sigma gaussiano de 0.5-10. |

### sharpen-advanced {#sharpen-advanced}

Afiação avançada com três métodos selecionáveis e um pré-passe opcional de redução de ruído.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` ou `high-pass` |
| `sigma` | number | Raio do desfoque gaussiano, 0.5-10 (adaptativo) |
| `m1` | number | Afiação de área plana, 0-10 (adaptativo) |
| `m2` | number | Afiação de área texturizada, 0-20 (adaptativo) |
| `x1` | number | Limiar plano/irregular, 0-10 (adaptativo) |
| `y2` | number | Clareamento máximo (limite de halo), 0-50 (adaptativo) |
| `y3` | number | Escurecimento máximo (limite de halo), 0-50 (adaptativo) |
| `amount` | number | Porcentagem de intensidade, 0-500 (unsharp-mask) |
| `radius` | number | Raio de desfoque, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | Brilho mínimo de borda, 0-255 (unsharp-mask) |
| `strength` | number | Força de mesclagem, 0-100 (high-pass) |
| `kernelSize` | number | `3` ou `5` para kernel 3x3 / 5x5 (high-pass) |
| `denoise` | string | Pré-passe de redução de ruído: `off`, `light`, `medium` ou `strong` |

Os parâmetros são específicos de cada método. Forneça apenas os relevantes para o método escolhido.

### color-blindness {#color-blindness}

Simula uma deficiência de visão de cores usando uma matriz 3x3 de recombinação de cores.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `type` | string | Um de: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Escreve ou remove campos individuais de metadados EXIF/IPTC sem remover o bloco inteiro.

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `artist` | string | Tag EXIF Artist |
| `copyright` | string | Tag EXIF Copyright |
| `imageDescription` | string | Tag EXIF ImageDescription |
| `software` | string | Tag EXIF Software |
| `dateTime` | string | Tag EXIF DateTime |
| `dateTimeOriginal` | string | Tag EXIF DateTimeOriginal |
| `clearGps` | boolean | Remove todas as tags GPS |
| `fieldsToRemove` | string[] | Lista de nomes de campos EXIF a excluir |

Todos os parâmetros são opcionais. Os campos listados em `fieldsToRemove` são excluídos do bloco EXIF existente. Os campos definidos pelos parâmetros nomeados são escritos (ou sobrescritos). Chaves binárias/inseguras como MakerNote são silenciosamente ignoradas.

## Detecção de formato {#format-detection}

O mecanismo detecta os formatos de entrada automaticamente a partir dos cabeçalhos dos arquivos, não apenas das extensões. Isso significa que um arquivo `.jpg` que na verdade é um PNG será tratado corretamente. A detecção usa uma abordagem em várias camadas: primeiro os magic bytes, depois a extensão do arquivo como fallback.

O SnapOtter suporta **mais de 55 formatos de entrada** e **13 formatos de saída**, incluindo 23 formatos RAW de câmera de mais de 20 marcas, formatos profissionais (PSD, EPS, OpenEXR, HDR), codecs modernos (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) e formatos científicos/de jogos (FITS, DDS). A decodificação é feita nativamente pelo Sharp sempre que possível, com fallback automático para ImageMagick, LibRaw e decodificadores CLI especializados.

Consulte a página [Formatos Suportados](/pt-BR/guide/supported-formats) para a lista completa.

## Extração de metadados {#metadata-extraction}

A ferramenta `info` retorna os metadados da imagem. Consulte [Informações da Imagem](/pt-BR/tools/image/info) para a referência completa de campos.

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
