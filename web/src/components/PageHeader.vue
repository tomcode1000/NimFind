<script setup lang="ts">
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";

const props = defineProps<{ title: string; back?: string }>();
const router = useRouter();

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push(props.back ?? "/");
}
</script>

<template>
  <header class="page-header">
    <button class="icon-btn" type="button" aria-label="Back" @click="goBack">
      <Icon name="chevron-left" :size="14" />
    </button>
    <h1 class="subtitle header-title">{{ title }}</h1>
    <div class="header-actions"><slot /></div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
}

.header-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 8px;
}
</style>
