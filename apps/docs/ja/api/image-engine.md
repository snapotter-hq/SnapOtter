---
description: "画像エンジン処理リファレンス。Sharp ベースのすべての画像処理と、そのパラメータ。"
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 3ee05b506af7
---

# 画像エンジン {#image-engine}

`@snapotter/image-engine` パッケージは、AI 以外のすべての画像処理を扱います。[Sharp](https://sharp.pixelplumbing.com/) をラップし、外部依存なしで完全にプロセス内で実行されます。

## 処理 {#operations}

### resize {#resize}

画像を特定の寸法またはパーセンテージでスケーリングします。

| パラメータ | 型 | 説明 |
|---|---|---|
| `width` | number | ターゲット幅(ピクセル) |
| `height` | number | ターゲット高さ(ピクセル) |
| `fit` | string | `cover`、`contain`、`fill`、`inside`、または `outside` |
| `withoutEnlargement` | boolean | true の場合、より小さい画像を拡大しません |
| `percentage` | number | 絶対的な寸法の代わりにパーセンテージでスケーリングします |

`width`、`height`、またはその両方を設定できます。片方だけを設定した場合、もう一方はアスペクト比を維持するように計算されます。

### crop {#crop}

画像から矩形領域を切り出します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `left` | number | 左端からの X オフセット |
| `top` | number | 上端からの Y オフセット |
| `width` | number | 切り抜き領域の幅 |
| `height` | number | 切り抜き領域の高さ |
| `unit` | string | `px`(デフォルト)または `percent` |

### rotate {#rotate}

指定した角度で画像を回転します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `angle` | number | 回転角度(度、0-360) |
| `background` | string | 露出した領域の塗りつぶし色(デフォルト: `#000000`)。90 度以外の角度にのみ適用されます。 |

### flip {#flip}

画像を水平方向、垂直方向、またはその両方に反転します。少なくとも 1 つは true である必要があります。

| パラメータ | 型 | 説明 |
|---|---|---|
| `horizontal` | boolean | 左右を反転する |
| `vertical` | boolean | 上下を反転する |

### convert {#convert}

画像の形式を変更します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `format` | string | ターゲット形式: `jpg`、`png`、`webp`、`avif`、`tiff`、`gif`、`jxl`、`heic`、`heif`、`bmp`、`ico`、`jp2`、`qoi` |
| `quality` | number | 圧縮品質(1-100、非可逆形式に適用) |

最初の 7 つの形式(`jpg` から `jxl` まで)は、Sharp によってプロセス内でエンコードされます。残りの形式は API 層で外部エンコーダーを使用します: `heic`/`heif` は heif-enc 経由、`bmp`/`ico` は ImageMagick 経由、`jp2` は opj_compress 経由、`qoi` はインラインの TypeScript コーデック経由です。

### compress {#compress}

同じ形式を維持しながらファイルサイズを削減します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `quality` | number | ターゲット品質(1-100) |
| `targetSizeBytes` | number | オプションのターゲットファイルサイズ(バイト単位) |
| `format` | string | オプションの形式の上書き |

### strip-metadata {#strip-metadata}

画像から EXIF、IPTC、XMP、および ICC メタデータを除去します。パラメータなし(または `stripAll: true`)の場合、すべてを除去します。選択的に除去するには個別のフラグを渡します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `stripAll` | boolean | すべてのメタデータを除去する(フラグが設定されていない場合のデフォルト) |
| `stripExif` | boolean | EXIF データを除去する(`stripGps` が別途設定されていない場合は GPS を含む) |
| `stripGps` | boolean | GPS 位置情報を除去する |
| `stripIcc` | boolean | ICC カラープロファイルを除去する |
| `stripXmp` | boolean | XMP メタデータを除去する |

### 色の調整 {#color-adjustments}

これらの処理は画像の色の特性を変更します。それぞれ単一の数値を受け取ります。

| 処理 | パラメータ | 範囲 | 説明 |
|---|---|---|---|
| `brightness` | `value` | -100 ～ 100 | 明るさを調整する |
| `contrast` | `value` | -100 ～ 100 | コントラストを調整する |
| `saturation` | `value` | -100 ～ 100 | 色の彩度を調整する |

### カラーフィルタ {#color-filters}

これらは固定の色変換を適用します。パラメータは受け取りません。

| 処理 | 説明 |
|---|---|
| `grayscale` | グレースケールに変換する |
| `sepia` | セピア調を適用する |
| `invert` | すべての色を反転する |

### カラーチャンネル {#color-channels}

個々の RGB カラーチャンネルを調整します。値は乗数で、100 = 変更なしです。

| パラメータ | 型 | 説明 |
|---|---|---|
| `red` | number | 赤チャンネルの乗数(0 ～ 200、100 = 変更なし) |
| `green` | number | 緑チャンネルの乗数(0 ～ 200、100 = 変更なし) |
| `blue` | number | 青チャンネルの乗数(0 ～ 200、100 = 変更なし) |

### sharpen {#sharpen}

単一の値で制御されるシンプルなシャープ化。

| パラメータ | 型 | 説明 |
|---|---|---|
| `value` | number | シャープ化の強度(0 ～ 100)。0.5 ～ 10 のガウスシグマにマッピングされます。 |

### sharpen-advanced {#sharpen-advanced}

3 つの選択可能な手法と、オプションのノイズ低減前処理を備えた高度なシャープ化。

| パラメータ | 型 | 説明 |
|---|---|---|
| `method` | string | `adaptive`、`unsharp-mask`、または `high-pass` |
| `sigma` | number | ガウスぼかしの半径、0.5 ～ 10(適応型) |
| `m1` | number | 平坦領域のシャープ化、0 ～ 10(適応型) |
| `m2` | number | テクスチャ領域のシャープ化、0 ～ 20(適応型) |
| `x1` | number | 平坦/ギザギザのしきい値、0 ～ 10(適応型) |
| `y2` | number | 最大明化(ハローのクランプ)、0 ～ 50(適応型) |
| `y3` | number | 最大暗化(ハローのクランプ)、0 ～ 50(適応型) |
| `amount` | number | 強度のパーセンテージ、0 ～ 500(アンシャープマスク) |
| `radius` | number | ぼかしの半径、0.1 ～ 5.0(アンシャープマスク) |
| `threshold` | number | 最小エッジ輝度、0 ～ 255(アンシャープマスク) |
| `strength` | number | ブレンドの強度、0 ～ 100(ハイパス) |
| `kernelSize` | number | 3x3 / 5x5 カーネルの場合は `3` または `5`(ハイパス) |
| `denoise` | string | ノイズ低減の前処理: `off`、`light`、`medium`、または `strong` |

パラメータは手法ごとに固有です。選択した手法に関連するものだけを指定してください。

### color-blindness {#color-blindness}

3x3 の色再結合マトリックスを使用して色覚異常をシミュレートします。

| パラメータ | 型 | 説明 |
|---|---|---|
| `type` | string | 次のいずれか: `protanopia`、`deuteranopia`、`tritanopia`、`protanomaly`、`deuteranomaly`、`tritanomaly`、`achromatopsia`、`blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

ブロック全体を除去することなく、個々の EXIF/IPTC メタデータフィールドを書き込みまたは削除します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `artist` | string | EXIF Artist タグ |
| `copyright` | string | EXIF Copyright タグ |
| `imageDescription` | string | EXIF ImageDescription タグ |
| `software` | string | EXIF Software タグ |
| `dateTime` | string | EXIF DateTime タグ |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal タグ |
| `clearGps` | boolean | すべての GPS タグを削除する |
| `fieldsToRemove` | string[] | 削除する EXIF フィールド名のリスト |

すべてのパラメータはオプションです。`fieldsToRemove` に列挙されたフィールドは、既存の EXIF ブロックから削除されます。名前付きパラメータを介して設定されたフィールドは書き込まれます(または上書きされます)。MakerNote のようなバイナリ/安全でないキーは黙って無視されます。

## 形式の検出 {#format-detection}

エンジンは、ファイル拡張子だけでなく、ファイルヘッダーから入力形式を自動的に検出します。つまり、実際には PNG である `.jpg` ファイルも正しく処理されます。検出は多層アプローチを使用します: 最初にマジックバイト、次にフォールバックとしてファイル拡張子です。

SnapOtter は **55 以上の入力形式**と **13 の出力形式**に対応しており、20 以上のブランドの 23 のカメラ RAW 形式、プロフェッショナル形式(PSD、EPS、OpenEXR、HDR)、最新のコーデック(JPEG XL、AVIF、HEIC、QOI、JPEG 2000)、科学/ゲーム形式(FITS、DDS)を含みます。デコードは可能な限り Sharp によってネイティブに処理され、ImageMagick、LibRaw、および専用の CLI デコーダーへの自動フォールバックがあります。

完全なリストについては、[対応形式](/ja/guide/supported-formats)ページを参照してください。

## メタデータの抽出 {#metadata-extraction}

`info` ツールは画像のメタデータを返します。フィールドの完全なリファレンスについては、[画像情報](/ja/tools/image/info)を参照してください。

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
