---
description: "图像引擎操作参考。所有基于 Sharp 的图像处理操作及其参数。"
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 76ddc27cca10
---

# 图像引擎 {#image-engine}

`@snapotter/image-engine` 包处理所有非 AI 图像操作。它封装了 [Sharp](https://sharp.pixelplumbing.com/)，完全在进程内运行，没有外部依赖。

## 操作 {#operations}

### resize {#resize}

将图像缩放到特定尺寸或按百分比缩放。

| 参数 | 类型 | 描述 |
|---|---|---|
| `width` | number | 目标宽度（像素） |
| `height` | number | 目标高度（像素） |
| `fit` | string | `cover`、`contain`、`fill`、`inside` 或 `outside` |
| `withoutEnlargement` | boolean | 若为 true，不会放大较小的图像 |
| `percentage` | number | 按百分比缩放，而非绝对尺寸 |

你可以设置 `width`、`height` 或两者。如果只设置其中一个，另一个会被计算以保持宽高比。

### crop {#crop}

从图像中裁出一个矩形区域。

| 参数 | 类型 | 描述 |
|---|---|---|
| `left` | number | 距左边缘的 X 偏移 |
| `top` | number | 距顶边缘的 Y 偏移 |
| `width` | number | 裁剪区域宽度 |
| `height` | number | 裁剪区域高度 |
| `unit` | string | `px`（默认）或 `percent` |

### rotate {#rotate}

将图像旋转给定角度。

| 参数 | 类型 | 描述 |
|---|---|---|
| `angle` | number | 旋转角度（度，0-360） |
| `background` | string | 暴露区域的填充颜色（默认：`#000000`）。仅适用于非 90 度角。 |

### flip {#flip}

水平、垂直或双向镜像图像。至少一项必须为 true。

| 参数 | 类型 | 描述 |
|---|---|---|
| `horizontal` | boolean | 左右镜像 |
| `vertical` | boolean | 上下镜像 |

### convert {#convert}

更改图像格式。

| 参数 | 类型 | 描述 |
|---|---|---|
| `format` | string | 目标格式：`jpg`、`png`、`webp`、`avif`、`tiff`、`gif`、`jxl`、`heic`、`heif`、`bmp`、`ico`、`jp2`、`qoi` |
| `quality` | number | 压缩质量（1-100，适用于有损格式） |

前七种格式（`jpg` 至 `jxl`）由 Sharp 在进程内编码。其余格式在 API 层使用外部编码器：`heic`/`heif` 通过 heif-enc，`bmp`/`ico` 通过 ImageMagick，`jp2` 通过 opj_compress，`qoi` 通过内联 TypeScript 编解码器。

### compress {#compress}

在保持相同格式的前提下减小文件大小。

| 参数 | 类型 | 描述 |
|---|---|---|
| `quality` | number | 目标质量（1-100） |
| `targetSizeBytes` | number | 可选的目标文件大小（字节） |
| `format` | string | 可选的格式覆盖 |

### strip-metadata {#strip-metadata}

从图像中移除 EXIF、IPTC、XMP 和 ICC 元数据。不带参数（或 `stripAll: true`）时移除所有内容。传入单独的标志以进行选择性移除。

| 参数 | 类型 | 描述 |
|---|---|---|
| `stripAll` | boolean | 移除所有元数据（未设置任何标志时的默认行为） |
| `stripExif` | boolean | 移除 EXIF 数据（若未单独设置 `stripGps`，则包含 GPS） |
| `stripGps` | boolean | 移除 GPS 位置数据 |
| `stripIcc` | boolean | 移除 ICC 色彩配置文件 |
| `stripXmp` | boolean | 移除 XMP 元数据 |

### 色彩调整 {#color-adjustments}

这些操作修改图像的色彩属性。每个操作接受一个数值。

| 操作 | 参数 | 范围 | 描述 |
|---|---|---|---|
| `brightness` | `value` | -100 到 100 | 调整亮度 |
| `contrast` | `value` | -100 到 100 | 调整对比度 |
| `saturation` | `value` | -100 到 100 | 调整色彩饱和度 |

### 色彩滤镜 {#color-filters}

这些应用固定的色彩变换。它们不接受参数。

| 操作 | 描述 |
|---|---|
| `grayscale` | 转换为灰度 |
| `sepia` | 应用棕褐色调 |
| `invert` | 反转所有颜色 |

### 色彩通道 {#color-channels}

调整单独的 RGB 色彩通道。数值为倍率，100 = 无变化。

| 参数 | 类型 | 描述 |
|---|---|---|
| `red` | number | 红色通道倍率（0 到 200，100 = 不变） |
| `green` | number | 绿色通道倍率（0 到 200，100 = 不变） |
| `blue` | number | 蓝色通道倍率（0 到 200，100 = 不变） |

### sharpen {#sharpen}

由单个数值控制的简单锐化。

| 参数 | 类型 | 描述 |
|---|---|---|
| `value` | number | 锐化强度（0 到 100）。映射到 0.5-10 的高斯 sigma。 |

### sharpen-advanced {#sharpen-advanced}

高级锐化，具有三种可选方法和一个可选的降噪预处理。

| 参数 | 类型 | 描述 |
|---|---|---|
| `method` | string | `adaptive`、`unsharp-mask` 或 `high-pass` |
| `sigma` | number | 高斯模糊半径，0.5-10（自适应） |
| `m1` | number | 平坦区域锐化，0-10（自适应） |
| `m2` | number | 纹理区域锐化，0-20（自适应） |
| `x1` | number | 平坦/锯齿阈值，0-10（自适应） |
| `y2` | number | 最大提亮（光晕钳制），0-50（自适应） |
| `y3` | number | 最大压暗（光晕钳制），0-50（自适应） |
| `amount` | number | 强度百分比，0-500（USM 锐化） |
| `radius` | number | 模糊半径，0.1-5.0（USM 锐化） |
| `threshold` | number | 最小边缘亮度，0-255（USM 锐化） |
| `strength` | number | 混合强度，0-100（高通） |
| `kernelSize` | number | `3` 或 `5`，对应 3x3 / 5x5 卷积核（高通） |
| `denoise` | string | 降噪预处理：`off`、`light`、`medium` 或 `strong` |

参数因方法而异。只提供与所选方法相关的参数。

### color-blindness {#color-blindness}

使用 3x3 色彩重组矩阵模拟色觉缺陷。

| 参数 | 类型 | 描述 |
|---|---|---|
| `type` | string | 取值之一：`protanopia`、`deuteranopia`、`tritanopia`、`protanomaly`、`deuteranomaly`、`tritanomaly`、`achromatopsia`、`blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

写入或移除单个 EXIF/IPTC 元数据字段，而无需移除整个数据块。

| 参数 | 类型 | 描述 |
|---|---|---|
| `artist` | string | EXIF Artist 标签 |
| `copyright` | string | EXIF Copyright 标签 |
| `imageDescription` | string | EXIF ImageDescription 标签 |
| `software` | string | EXIF Software 标签 |
| `dateTime` | string | EXIF DateTime 标签 |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal 标签 |
| `clearGps` | boolean | 移除所有 GPS 标签 |
| `fieldsToRemove` | string[] | 要删除的 EXIF 字段名列表 |

所有参数均为可选。`fieldsToRemove` 中列出的字段会从现有 EXIF 块中删除。通过命名参数设置的字段会被写入（或覆盖）。像 MakerNote 这类二进制/不安全的键会被静默忽略。

## 格式检测 {#format-detection}

引擎会根据文件头自动检测输入格式，而不仅仅依赖文件扩展名。这意味着一个实际上是 PNG 的 `.jpg` 文件也能被正确处理。检测采用多层方法：先看魔数字节，再以文件扩展名作为回退。

SnapOtter 支持 **55+ 种输入格式**和 **13 种输出格式**，包括来自 20 多个品牌的 23 种相机 RAW 格式、专业格式（PSD、EPS、OpenEXR、HDR）、现代编解码格式（JPEG XL、AVIF、HEIC、QOI、JPEG 2000）以及科学/游戏格式（FITS、DDS）。解码在可能的情况下由 Sharp 原生处理，并自动回退到 ImageMagick、LibRaw 和专用 CLI 解码器。

完整列表请参见[支持的格式](/zh-CN/guide/supported-formats)页面。

## 元数据提取 {#metadata-extraction}

`info` 工具返回图像元数据。完整字段参考请参见[图像信息](/zh-CN/tools/image/info)。

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
