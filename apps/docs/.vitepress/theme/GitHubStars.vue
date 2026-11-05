<script setup lang="ts">
import { useData } from "vitepress";
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { normalizeLocale, t } from "../i18n/ui.mjs";
import { data as githubStars } from "./github-stars.data.ts";

const { lang } = useData();
const locale = computed(() => normalizeLocale(lang.value));
const starLabel = computed(() => t(locale.value, "github.star"));

// Resolved at build time (see github-stars.data.ts), so no per-page request to
// api.github.com is made from the browser.
const stars = githubStars.display;
const repo = "https://github.com/snapotter-hq/snapotter";

// Localized navs are often too full for the labelled button, and the fixed nav
// clips rather than scrolls (#556). Step down to octocat + count, then to
// nothing, until the nav fits. The state is an attribute on <html>, not Vue
// state, so each step restyles synchronously before the next measurement, and
// github-stars.css can bring back VitePress's own GitHub icon once hidden.
// Edges, not scrollWidth: VitePress's closed flyout menus are absolutely
// positioned and inflate scrollWidth even when everything fits.
function navOverflows(): boolean {
  const body = document.querySelector(".VPNavBar .content-body");
  if (!body) return false;
  const { left, right } = body.getBoundingClientRect();
  return left < 0 || right > document.documentElement.clientWidth;
}

function refit() {
  const root = document.documentElement;
  root.dataset.starFit = "full";
  if (navOverflows()) root.dataset.starFit = "compact";
  if (navOverflows()) root.dataset.starFit = "hidden";
}

// The nav keeps settling after mount (web fonts, sibling components), so refit
// whenever its content box changes size as well as on viewport resizes.
let observer: ResizeObserver | undefined;
onMounted(() => {
  refit();
  window.addEventListener("resize", refit);
  const content = document.querySelector(".VPNavBar .content");
  if (content) {
    observer = new ResizeObserver(refit);
    observer.observe(content);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", refit);
  observer?.disconnect();
  delete document.documentElement.dataset.starFit;
});
// Nav labels change width with the locale, without a resize.
watch(locale, refit, { flush: "post" });
</script>

<template>
  <div class="github-btn-wrapper">
    <a :href="repo" target="_blank" rel="noopener" class="github-btn" title="Star on GitHub">
      <!-- GitHub Octocat -->
      <svg class="github-icon" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
      <span class="github-btn-label">{{ starLabel }}</span>
    </a>
    <a
      v-if="stars"
      :href="`${repo}/stargazers`"
      target="_blank"
      rel="noopener"
      class="github-btn-count"
      title="Stargazers"
    >
      {{ stars }}
    </a>
  </div>
</template>
