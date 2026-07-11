---
description: "SnapOtter कौन सा अनाम usage data एकत्र करता है, इसे कब भेजा जाता है, और instance-wide product analytics को कैसे बंद करें।"
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: cf0c51fe9a2f
---

# What SnapOtter collects {#what-snapotter-collects}

Anonymous Product Analytics default रूप से चालू है और एक administrator द्वारा पूरे instance के लिए सेट किया जाता है। इसे Settings > System > Privacy के तहत बंद करें।

## Events we send (when enabled) {#events-we-send-when-enabled}

- tool_used: tool id, status, duration, category, यह एक AI tool है या नहीं, विफलता पर एक error code।
- pipeline_executed: step count, tool ids, batch flag, file count, duration, status।
- ai_bundle_action: bundle id, action, duration।
- Frontend usage: कौन से tool pages खुलते हैं, जोड़ी गई files (केवल counts), tool शुरू हुआ, downloads, saves, search (केवल result count), batch processed।
- Crash reports: error type और केवल file basenames के साथ एक source stack।

## What we never collect {#what-we-never-collect}

- File names या paths
- File contents
- OCR output text
- Image metadata (EXIF)
- Extracted document text
- आपका IP address या account identity

## Turning it off {#turning-it-off}

Admins: Settings > System > Privacy, "Anonymous Product Analytics" को बंद कर दें। यह तुरंत रुक जाता है, instance-wide। एक ऐसी image बनाने के लिए जो कभी emit न कर सके, `SNAPOTTER_ANALYTICS=off` build arg सेट करें।
