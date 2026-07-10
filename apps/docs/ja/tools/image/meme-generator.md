---
description: "テンプレートやカスタム画像、スタイル付きテキストボックス、フォントオプションでミームを作成します。"
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 52e455e46257
---

# ミームジェネレーター {#meme-generator}

組み込みテンプレートまたはカスタム画像を使ってミームを作成します。クラシックなミームスタイル（太字、アウトライン付きテキスト）、複数のレイアウトプリセット、フォント選択でテキストを追加できます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

次のいずれかを受け付けます。
- 画像ファイルと JSON の `settings` フィールドを含む **マルチパートフォームデータ**（カスタム画像モード）
- `templateId` を含む **JSON ボディ**（テンプレートモード、ファイルアップロード不要）

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | 組み込みミームテンプレート ID。指定した場合、画像のアップロードは不要 |
| textLayout | string | No | `"top-bottom"` | テキストボックスのレイアウト: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | `id` と `text` フィールドを持つテキストボックスオブジェクトの配列 |
| fontFamily | string | No | `"anton"` | フォント: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | フォントサイズ（ピクセル、8～200）。省略時は自動計算 |
| textColor | string | No | `"#ffffff"` | テキストの塗りつぶし色 |
| strokeColor | string | No | `"#000000"` | テキストの縁取り／アウトライン色 |
| textAlign | string | No | `"center"` | テキストの配置: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | テキストを大文字に変換 |

### テキストボックス {#text-boxes}

`textBoxes` 配列の各エントリは次を持つ必要があります。

| フィールド | 型 | 説明 |
|-------|------|-------------|
| id | string | レイアウトに対応するボックス識別子（例: `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`） |
| text | string | 表示するミームテキスト |

### テキストレイアウトのボックス ID {#text-layout-box-ids}

| レイアウト | 利用可能なボックス ID |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## リクエスト例 {#example-request}

上下のテキストを付けたカスタム画像:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

組み込みテンプレートを使用（JSON ボディ、ファイルアップロードなし）:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## 注意事項 {#notes}

- `templateId` かアップロードした画像ファイルのいずれかが必要です。両方を指定した場合はテンプレートが使用されます。
- テンプレートは独自のテキストボックス位置を定義するため、テンプレート使用時は `textLayout` パラメーターは無視されます。
- テキストはクラシックなミームの見た目のために、アウトラインの縁取り付き SVG としてレンダリングされます。
- 明示的に設定されていない場合、フォントサイズはテキストボックスに収まるよう自動計算されます。
- 空のテキストボックスはスキップされます（すべてのボックスが空の場合はレンダリングされません）。
- テンプレート使用時は、出力ファイル名にテンプレート ID が含まれます（例: `meme-drake.png`）。
- HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。
