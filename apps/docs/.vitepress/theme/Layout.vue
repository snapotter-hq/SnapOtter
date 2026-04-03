<script setup>
import DefaultTheme from "vitepress/theme";
import GitHubStars from "./GitHubStars.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <GitHubStars />
    </template>
  </Layout>
</template>
