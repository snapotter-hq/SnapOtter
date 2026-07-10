<script setup lang="ts">
import { useData } from "vitepress";
import { computed, ref } from "vue";
import { normalizeLocale, t } from "../i18n/ui.mjs";

const { lang } = useData();
// Guard both existence AND callability: VitePress SSR defines a `localStorage`
// global that is not a real Storage, so `getItem` may not be a function there.
function readDismissed() {
  try {
    return (
      typeof localStorage?.getItem === "function" && localStorage.getItem("so-mt-banner") === "1"
    );
  } catch {
    return false;
  }
}
const dismissed = ref(readDismissed());
const locale = computed(() => normalizeLocale(lang.value));
const show = computed(() => locale.value !== "en" && !dismissed.value);
const text = computed(() => t(locale.value, "banner.text"));
const cta = computed(() => t(locale.value, "banner.cta"));

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem("so-mt-banner", "1");
  } catch {
    // ignore storage failures (private mode)
  }
}
</script>

<template>
  <div v-if="show" class="mt-banner" role="note">
    <span>{{ text }}</span>
    <a href="https://github.com/snapotter-hq/snapotter/blob/main/apps/docs/guide/translations.md">{{ cta }}</a>
    <button type="button" class="mt-dismiss" aria-label="Dismiss" @click="dismiss">×</button>
  </div>
</template>

<style scoped>
.mt-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  font-size: 13px;
  background: #FFF5ED;
  border-bottom: 1px solid #EBDDCC;
  color: #7A4A1E;
}
.mt-banner a { color: #A85518; font-weight: 600; }
.mt-dismiss {
  margin-inline-start: auto;
  border: 0;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: inherit;
}
:root.dark .mt-banner { background: #241A13; border-color: #3A2C20; color: #E0C6A8; }
</style>
