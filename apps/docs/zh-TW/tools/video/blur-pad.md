---
description: "以影片的模糊副本填充橫條。"
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 794aee3ed44b
---

# 模糊填充 {#blur-pad}

以影片經模糊、縮放後的副本填充填充區域，而非純色橫條，讓影片符合目標長寬比。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

接受包含影片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| target | string | 否 | `"16:9"` | 目標長寬比：`16:9`、`9:16`、`1:1`、`4:3`、`3:4` |
| blur | number | 否 | `20` | 背景的高斯模糊 sigma 值（2-50） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## 注意事項 {#notes}

- 模糊值越高，背景越柔和、越抽象。數值越低則保留越多細節。
- 若影片已符合目標長寬比，則會原封不動地回傳檔案。
- 若想使用純色填充，請改用「長寬比填充」工具。
