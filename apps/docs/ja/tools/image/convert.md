---
description: "AVIF、JXL、HEIC などのモダンな形式を含め、画像を各形式間で変換します。"
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 7676d19fa60d
---

# 画像変換 {#convert}

画像を各形式間で変換します。一般的なウェブ形式に加え、HEIC、JXL、BMP、ICO、JP2、QOI、PSD などの特殊な形式にも対応します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/convert`

画像ファイルとJSONの `settings` フィールドを含むmultipartフォームデータを受け付けます。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| format | string | はい | - | 目標形式: `jpg`、`png`、`webp`、`avif`、`tiff`、`gif`、`heic`、`heif`、`jxl`、`bmp`、`ico`、`jp2`、`qoi`、`psd`、`ppm`、`eps`、`tga` |
| quality | number | いいえ | - | 出力品質（1〜100）。jpg、webp、avif、heic などの非可逆形式に適用されます。 |

## 対応する出力形式 {#supported-output-formats}

| 形式 | 種類 | 補足 |
|--------|------|-------|
| jpg | 非可逆 | JPEG、最も互換性が高い |
| png | 可逆 | 透明度に対応 |
| webp | 両方 | モダンなウェブ形式、良好な圧縮 |
| avif | 非可逆 | 次世代形式、優れた圧縮 |
| tiff | 両方 | 印刷/出版ワークフロー |
| gif | 可逆 | 256色に制限 |
| heic / heif | 非可逆 | Appleエコシステムの形式 |
| jxl | 両方 | JPEG XL、次世代形式 |
| bmp | 可逆 | 非圧縮ビットマップ |
| ico | 可逆 | Windowsアイコン形式 |
| jp2 | 非可逆 | JPEG 2000 |
| qoi | 可逆 | Quite OK Image形式 |
| psd | レイヤー | Adobe Photoshop（ImageMagickが必要） |
| ppm | 可逆 | Portable Pixmap（PPM/PGM/PBM） |
| eps | ベクター | Encapsulated PostScript |
| tga | 可逆 | Targa画像形式 |

## リクエスト例 {#example-request}

WebPに変換:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

PNG（可逆）に変換:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## 補足 {#notes}

- 出力ファイル名の拡張子は目標形式に合わせて自動で更新されます。
- SVGの入力は変換前に300 DPIでラスタライズされます。
- PSD変換にはサーバーにImageMagickがインストールされている必要があります。
- BMP、EPS、ICO、JP2、JXL、PPM、QOI、TGA は専用のCLIエンコーダーを使用し、Sharpの処理をバイパスします。
- HEIC/HEIF のエンコードはシステムのHEICエンコーダーライブラリを使用します。
- 入力形式は幅広く、JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、RAW（CR2、NEF、ARW など）、PSD、SVG、BMP などに対応します。
