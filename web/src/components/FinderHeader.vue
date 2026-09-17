<script setup lang="ts">
import Icon from "./Icon.vue";
import LogoMark from "./LogoMark.vue";
</script>

<template>
  <header class="finder-header">
    <span class="brand"><LogoMark :size="28" /> NimFind</span>
    <span class="private"><Icon name="locked-lock" :size="10" /> Private page</span>
  </header>
</template>

<style scoped>
.finder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.private {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--nq-darkblue-60);
  background: #fff;
  box-shadow: var(--shadow-card);
}
</style>
