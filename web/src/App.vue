<script setup lang="ts">
import { onMounted } from "vue";
import { loadConfig } from "./lib/session";

onMounted(() => {
  loadConfig().catch(() => {
    // The app still works without config; the network only selects explorer links and the wallet Hub.
  });
});
</script>

<template>
  <RouterView />
</template>
