<script setup>
import DefaultTheme from "vitepress/theme";
import VPSwitchAppearance from "vitepress/dist/client/theme-default/components/VPSwitchAppearance.vue";
import GitHubStars from "./GitHubStars.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <div class="nav-bar-right">
        <VPSwitchAppearance />
        <GitHubStars />
      </div>
    </template>
  </Layout>
</template>
