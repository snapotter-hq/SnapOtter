---
description: "ピクセルを再エンコードせずに、画像のEXIF、IPTC、GPS、XMP メタデータフィールドを編集します。"
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: cc4a554a90d8
---

# メタデータ編集 {#edit-metadata}

EXIF、IPTC、GPS座標、日付、キーワードを含む画像メタデータフィールドを編集します。内部でExifToolを使用するため、メタデータはピクセルを再エンコードせずにその場で書き込まれ、画像品質が完全に保持されます。

## API エンドポイント {#api-endpoints}

### メタデータ編集 {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

メタデータフィールドを画像に書き込み、変更されたファイルを返します。

### メタデータ検査 {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

ExifTool経由で画像の全メタデータをJSONとして返します。画像は変更しません。

## パラメータ（編集） {#parameters-edit}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| title | string | いいえ | - | 画像タイトル（XMP/EXIF） |
| author | string | いいえ | - | 作成者名 |
| artist | string | いいえ | - | アーティスト名（EXIF Artistタグ） |
| copyright | string | いいえ | - | 著作権表示 |
| imageDescription | string | いいえ | - | 画像の説明（EXIF） |
| software | string | いいえ | - | ソフトウェアタグ |
| dateTime | string | いいえ | - | EXIF DateTime値 |
| dateTimeOriginal | string | いいえ | - | EXIF DateTimeOriginal値 |
| setAllDates | string | いいえ | - | すべての日付フィールドを一度に設定 |
| dateShift | string | いいえ | - | すべての日付をオフセット分ずらす（形式: `+HH:MM` または `-HH:MM`） |
| clearGps | boolean | いいえ | `false` | すべてのGPSデータを削除 |
| gpsLatitude | number | いいえ | - | GPS緯度を設定（-90〜90） |
| gpsLongitude | number | いいえ | - | GPS経度を設定（-180〜180） |
| gpsAltitude | number | いいえ | - | GPS高度をメートル単位で設定 |
| keywords | string[] | いいえ | - | 追加または設定するキーワード/タグ |
| keywordsMode | string | いいえ | `"add"` | キーワードの扱い方: `add`（追加）または `set`（置換） |
| fieldsToRemove | string[] | いいえ | `[]` | 削除する特定のメタデータフィールド名のリスト |
| iptcTitle | string | いいえ | - | IPTC Object Name |
| iptcHeadline | string | いいえ | - | IPTC Headline |
| iptcCity | string | いいえ | - | IPTC City |
| iptcState | string | いいえ | - | IPTC Province/State |
| iptcCountry | string | いいえ | - | IPTC Country |

## リクエスト例 {#example-request}

作成者と著作権を設定:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

GPS座標を設定:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

GPSを削除してキーワードを追加:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

メタデータを検査:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## レスポンス例（編集） {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## 補足 {#notes}

- このツールはサーバーにExifToolがインストールされている必要があります。Dockerイメージには含まれています。
- メタデータはその場で書き込まれるため、ピクセルの再エンコードは発生しません。ファイルサイズの変化は最小限です（メタデータのバイト分のみ）。
- `dateShift` パラメータはすべての日付フィールドを指定したオフセット分ずらします。タイムゾーンエラーの修正に便利です（例: `+02:00` または `-05:30`）。
- 変更が要求されない場合（すべてのパラメータが省略または空）、元のファイルが変更されずに返されます。
- 対応形式: JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC/HEIF。
- ブラウザでプレビューできない形式（HEIF、TIFF）の場合、レスポンスにはWebPプレビューを含む `previewUrl` フィールドが含まれます。
