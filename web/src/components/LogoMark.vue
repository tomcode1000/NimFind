<script setup lang="ts">
/** NimFind mark: the Nimiq hexagon drawn as a magnifying lens. */
withDefaults(defineProps<{ size?: number }>(), { size: 36 });
</script>

<template>
  <span class="logo-mark" :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.3}px` }">
    <svg viewBox="0 0 32 32" :width="size * 0.66" :height="size * 0.66" aria-hidden="true">
      <path
        d="M22.2 13.5 18.1 20.6H9.9L5.8 13.5 9.9 6.4h8.2z"
        fill="none"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <path d="M19.6 20.4 25.8 26.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  </span>
</template>

<style scoped>
.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--nq-gold);
  background: var(--gradient-darkblue);
  box-shadow: 0 6px 18px rgba(31, 35, 72, 0.22);
}
</style>
