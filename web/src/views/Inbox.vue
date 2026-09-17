<script setup lang="ts">
import { onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import PageHeader from "../components/PageHeader.vue";
import { api, type Report } from "../lib/api";
import { useAuthGuard, usePolling } from "../lib/composables";
import { errorMessage, relativeTime } from "../lib/format";
import { KIND_ICONS } from "../lib/kinds";
import { session } from "../lib/session";

const reports = ref<Report[] | null>(null);
const error = ref("");
const handleAuth = useAuthGuard();

async function load() {
  try {
    reports.value = await api.inbox(session.token!);
    error.value = "";
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

onMounted(load);
usePolling(load, 15_000);
</script>

<template>
  <main class="page">
    <PageHeader title="Messages from finders" />
    <p v-if="error" class="error-text">{{ error }}</p>
    <div v-if="reports === null && !error" class="center-state"><div class="spinner" /></div>

    <section v-else-if="reports?.length === 0" class="center-state">
      <Icon name="message" :size="36" class="muted" />
      <strong>No messages yet</strong>
      <p class="muted small">When someone scans one of your tags and writes to you, it shows up here.</p>
    </section>

    <RouterLink v-for="report in reports ?? []" :key="report.id" :to="`/app/reports/${report.id}`" class="list-item">
      <span class="kind-badge"><Icon :name="KIND_ICONS[report.tag?.kind ?? 'other']" :size="20" /></span>
      <span class="stack preview-text">
        <span class="row between">
          <strong>{{ report.tag?.label }}</strong>
          <span class="muted small">{{ relativeTime(report.updatedAt) }}</span>
        </span>
        <span class="muted small clamp">{{ report.lastMessage }}</span>
      </span>
      <span v-if="report.rewardStatus === 'paid'" class="pill pill-green">Rewarded</span>
      <span v-else-if="report.status === 'open'" class="pill pill-blue">Open</span>
    </RouterLink>
  </main>
</template>

<style scoped>
.preview-text {
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.between {
  justify-content: space-between;
}

.clamp {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
