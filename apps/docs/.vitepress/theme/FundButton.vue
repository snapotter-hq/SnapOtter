<script setup lang="ts">
import { useData } from "vitepress";
import { computed } from "vue";
import { normalizeLocale, t } from "../i18n/ui.mjs";

const { lang } = useData();
const locale = computed(() => normalizeLocale(lang.value));
const label = computed(() => t(locale.value, "fund.label"));
</script>

<template>
  <a
    href="https://github.com/sponsors/snapotter-hq"
    target="_blank"
    rel="noopener"
    class="fund-btn"
    :title="label"
  >
    <svg class="fund-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
    <span>{{ label }}</span>
  </a>
</template>
