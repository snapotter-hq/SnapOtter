---
description: "音声のメタデータタグ（ID3）を表示、編集、または削除します。"
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 2662e9e871bb
---

# 音声メタデータ {#audio-metadata}

タイトル、アーティスト、アルバムなどの音声メタデータタグ（ID3 や類似のタグ形式）を表示、編集、または削除します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

音声ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## パラメータ {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | 既存のすべてのメタデータタグを削除する |
| title | string | No | - | タイトルタグを設定する（最大 500 文字） |
| artist | string | No | - | アーティストタグを設定する（最大 500 文字） |
| album | string | No | - | アルバムタグを設定する（最大 500 文字） |

## リクエスト例 {#example-request}

メタデータタグを編集する:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

すべてのメタデータを削除する:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## 注意事項 {#notes}

- レスポンスには、コンテナ形式、長さ、ビットレート、現在のタグを含む `metadata` オブジェクトが含まれます。
- `strip` が `true` の場合、すべてのタグフィールドは無視され、既存のすべてのタグが削除されます。
- 指定したタグのみが更新され、指定されていないタグは変更されません。
- 出力形式は入力形式と一致します。
