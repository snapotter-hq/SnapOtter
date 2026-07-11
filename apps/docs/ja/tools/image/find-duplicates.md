---
description: "知覚ハッシュを使用して重複画像および類似画像を検出します。"
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: e3471d471961
---

# 重複を検索 {#find-duplicates}

複数の画像をアップロードし、知覚ハッシュ（dHash）を使用して重複および類似の画像を検出します。類似画像をグループにまとめ、各グループ内の最高品質バージョンを特定し、削減可能な容量を計算します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

複数の画像ファイルとオプションの JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| threshold | number | いいえ | `8` | 画像を重複とみなす最大ハミング距離（0 から 20）。低いほど厳密なマッチング |

### ファイルフィールド {#file-fields}

multipart リクエストで少なくとも 2 つの画像ファイルをアップロードします（すべて `file` フィールド名を使用するか、ファイルパートには任意のフィールド名を使用します）。

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## レスポンス例 {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## レスポンスフィールド {#response-fields}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| totalImages | number | 正常に分析された画像の数 |
| duplicateGroups | array | 重複画像のグループ |
| uniqueImages | number | どの重複グループにも属さない画像の数 |
| spaceSaveable | number | 最良でない重複を削除することで節約できる総バイト数 |
| skippedFiles | array | 処理できなかったファイル（ファイル名と理由を含む） |

### 重複グループオブジェクト {#duplicate-group-object}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| groupId | number | グループ識別子 |
| files | array | この重複グループ内の画像 |

### ファイルオブジェクト（グループ内） {#file-object-within-a-group}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| filename | string | 元のファイル名 |
| similarity | number | 参照画像（グループの先頭）に対する類似度のパーセンテージ |
| width | number | 画像の幅（ピクセル） |
| height | number | 画像の高さ（ピクセル） |
| fileSize | number | ファイルサイズ（バイト） |
| format | string | 画像形式 |
| isBest | boolean | これが最高品質バージョン（最もピクセルが多く、ファイルが最大）かどうか |
| thumbnail | string または null | プレビュー用の Base64 JPEG サムネイル（幅 200px） |

## 注記 {#notes}

- 知覚的類似性検出には 128 ビットの dHash（64 ビットの行 + 64 ビットの列）を使用します。これにより、リサイズ、再圧縮、軽微な編集をまたいでも重複を検出できます。
- しきい値はハッシュ間の最大ハミング距離を表します。デフォルトの 8 は誤検出を避けつつ類似画像を検出します。ピクセル完全一致のみには 0 を、非常に緩いマッチングには 15〜20 を使用します。
- 各グループの「最良」画像は、最もピクセルが多い（幅 x 高さ）ものであり、同点の場合はファイルサイズで判定されます。
- 少なくとも 2 枚の画像が必要です。検証やデコードに失敗したファイルは、リクエスト全体を失敗させるのではなく `skippedFiles` に報告されます。
- サムネイルはデータ URI としてエンコードされた幅 200px の JPEG プレビューです。
- すべての一般的な形式に対応しています（HEIC、RAW、PSD、SVG は自動的にデコードされます）。
