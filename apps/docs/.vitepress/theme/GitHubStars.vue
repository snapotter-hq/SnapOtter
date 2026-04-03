<script setup lang="ts">
import { ref, onMounted } from "vue";

const stars = ref<string | null>(null);
const repo = "https://github.com/stirling-image/stirling-image";

onMounted(async () => {
  try {
    const res = await fetch("https://api.github.com/repos/stirling-image/stirling-image");
    if (!res.ok) return;
    const data = await res.json();
    const count = data.stargazers_count;
    stars.value = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  } catch {
    // Silently fail - stars badge just won't show a count
  }
});
</script>

<template>
  <div class="github-stars-wrapper">
    <a :href="repo" target="_blank" rel="noopener" class="github-stars-btn">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"
        />
      </svg>
      <span>Star</span>
    </a>
    <a
      v-if="stars !== null"
      :href="`${repo}/stargazers`"
      target="_blank"
      rel="noopener"
      class="github-stars-count"
    >
      {{ stars }}
    </a>
  </div>
</template>
