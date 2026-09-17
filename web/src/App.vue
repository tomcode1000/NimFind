<script setup lang="ts">
import { onMounted } from "vue";
import { loadConfig, session } from "./lib/session";

onMounted(() => {
  loadConfig().catch(() => {
    // The app still works without config; only the network banner and pass price depend on it.
  });
});
</script>

<template>
  <div v-if="session.config?.network === 'testnet'" class="network-banner">Testnet · test NIM only</div>
  <RouterView />
</template>
