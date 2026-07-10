<script setup>
import { useData } from "vitepress";
import VPSwitchAppearance from "vitepress/dist/client/theme-default/components/VPSwitchAppearance.vue";
import DefaultTheme from "vitepress/theme";
import { computed } from "vue";
import { normalizeLocale, t } from "../i18n/ui.mjs";
import FundButton from "./FundButton.vue";
import GitHubStars from "./GitHubStars.vue";
import MachineTranslationBanner from "./MachineTranslationBanner.vue";

const { Layout } = DefaultTheme;
const { lang } = useData();
const locale = computed(() => normalizeLocale(lang.value));
</script>

<template>
  <Layout>
    <template #layout-top>
      <MachineTranslationBanner />
    </template>
    <template #nav-bar-content-after>
      <div class="nav-bar-right">
        <VPSwitchAppearance />
        <FundButton />
        <GitHubStars />
      </div>
    </template>
    <template #not-found>
      <div class="not-found-page">
        <span class="not-found-otter">🦦</span>
        <h1 class="not-found-heading">{{ t(locale, "notFound.heading") }}</h1>
        <p class="not-found-text">{{ t(locale, "notFound.text") }}</p>
        <a href="/" class="not-found-link">{{ t(locale, "notFound.link") }}</a>
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.not-found-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
  padding: 2rem;
}

.not-found-otter {
  font-size: 4.5rem;
}

.not-found-heading {
  margin-top: 1.5rem;
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.not-found-text {
  margin-top: 1rem;
  font-size: 1.125rem;
  color: var(--vp-c-text-2);
}

.not-found-link {
  margin-top: 2rem;
  display: inline-block;
  padding: 0.625rem 1.5rem;
  border-radius: 0.5rem;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s;
}

.not-found-link:hover {
  background: var(--vp-c-brand-2);
  text-decoration: none;
}
</style>
