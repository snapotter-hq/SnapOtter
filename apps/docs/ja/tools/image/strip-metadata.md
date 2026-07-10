---
description: "プライバシー保護とファイルサイズ削減のため、画像からEXIF、GPS、ICC、XMPのメタデータを削除します。"
i18n_source_hash: e89147734fd0
i18n_provenance: human
i18n_output_hash: 5d65887b5d1c
---

# Remove Metadata {#remove-metadata}

画像からEXIF、GPS、ICCカラープロファイル、XMPメタデータを削除します。プライバシー保護（GPS座標やカメラ情報の除去）やファイルサイズの削減に役立ちます。

## API Endpoints {#api-endpoints}

### Strip Metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

画像を処理し、選択したメタデータを削除したクリーンなバージョンを返します。

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

画像を変更せずに、解析済みメタデータをJSONで返します。削除前にどのメタデータが存在するかをプレビューするのに便利です。

## Parameters (Strip) {#parameters-strip}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | EXIFデータ（カメラ設定、日付など）を削除します |
| stripGps | boolean | No | `false` | GPS/位置情報のみを削除します |
| stripIcc | boolean | No | `false` | ICCカラープロファイルを削除します |
| stripXmp | boolean | No | `false` | XMPメタデータ（Adobe、IPTC）を削除します |
| stripAll | boolean | No | `true` | すべてのメタデータを一括削除します |

`stripAll`が`true`の場合、個別のフラグより優先され、すべてが削除されます。

## Example Request {#example-request}

すべてのメタデータを削除:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

GPSデータのみを削除（カメラ情報とカラープロファイルは維持）:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

画像を変更せずにメタデータを確認:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect) {#example-response-inspect}

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

## Notes {#notes}

- 画像は削除後に元のフォーマットで再エンコードされます。JPEGは品質90のmozjpeg、PNGは圧縮レベル9、WebPは品質85を使用します。
- 画像が非sRGBプロファイルでタグ付けされていた場合、ICCプロファイルの削除により微妙な色ずれが生じることがあります。色の正確さが重要な場合は`stripIcc: false`を使用してください。
- inspectエンドポイントは、利便性のためGPS座標を（アンダースコア接頭辞付きの）10進の緯度/経度値に解析します。
- 対応する入力フォーマット: JPEG、PNG、WebP、AVIF、TIFF、GIF。
