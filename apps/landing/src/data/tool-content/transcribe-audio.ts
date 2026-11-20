import type { ToolContent } from "./types.js";

export const transcribeAudio: ToolContent = {
  toolId: "transcribe-audio",
  testedWith:
    "SnapOtter 2.3.0 (official Docker image) with the Transcription bundle (faster-whisper small), CPU only, language Auto, measured 2026-11-19.",
  runs: [
    {
      input:
        "John F. Kennedy's Rice University moon speech, 1962. MP3, 128 kb/s stereo, 17 min 40 s",
      settings: "Language Auto, output format TXT",
      output:
        "Plain text, 2,219 words. English detected on its own. Read cleanly, with a couple of misheard names and phrases",
      inputBytes: 16_965_425,
      outputBytes: 12_153,
    },
    {
      input: "Same speech",
      settings: "Language Auto, output format SRT",
      output: "SRT subtitles, 175 timed cues from 00:00:02 to 00:17:32",
      inputBytes: 16_965_425,
      outputBytes: 18_170,
    },
  ],
  steps: [
    "Open Transcribe Audio in the Audio section and drop in a recording.",
    "Leave Language on Auto, or pick it if you know it.",
    "Choose TXT for a plain transcript, or SRT or VTT for timed subtitles.",
    "Click Transcribe. Long recordings run in the background with a progress bar, then download the file.",
  ],
  limits: [
    'Names and unusual phrases are where it slips. "President Pitzer" came out as "President Pipps", and "Why, 35 years ago, fly the Atlantic?" as "Five-thirty-five years ago, fly the Atlantic". Proofread anything you publish.',
    "It needs the Transcription feature bundle, which an admin installs once from the settings page. After that it runs offline on your server.",
    "Languages: Auto, English, German, French, Spanish, Chinese, Japanese, Korean, Indonesian, Thai and Vietnamese.",
    "The archive's original OGG of this speech failed to decode because of broken timestamps in the file. The MP3 above was made from it. That bug is GitHub issue #4980.",
  ],
  sources: [
    {
      name: "Jfk rice university we choose to go to the moon.ogg (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Jfk_rice_university_we_choose_to_go_to_the_moon.ogg",
      license: "Public domain (US government work)",
    },
  ],
  alternatives: {
    text: "Otter.ai's free Basic plan gives 300 transcription minutes a month, caps each conversation at 30 minutes, and allows 3 audio or video file imports per user, ever.",
    sourceName: "Otter.ai pricing",
    sourceUrl: "https://otter.ai/pricing",
    checked: "2026-11-19",
  },
};
