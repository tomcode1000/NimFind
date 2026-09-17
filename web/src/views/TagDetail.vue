<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import PageHeader from "../components/PageHeader.vue";
import { api, type Report, type Tag } from "../lib/api";
import { COLORS, drawQr } from "../lib/canvas";
import { useAuthGuard } from "../lib/composables";
import { errorMessage, formatNim, relativeTime, tagUrl } from "../lib/format";
import { KIND_ICONS } from "../lib/kinds";
import { session } from "../lib/session";

const route = useRoute();
const router = useRouter();
const handleAuth = useAuthGuard();
const code = String(route.params.code);

const tag = ref<Tag | null>(null);
const reports = ref<Report[]>([]);
const error = ref("");
const busy = ref(false);
const copied = ref(false);
const editingReward = ref(false);
const rewardDraft = ref(0);
const qrCanvas = ref<HTMLCanvasElement | null>(null);

async function load() {
  try {
    const result = await api.tag(session.token!, code);
    tag.value = result.tag;
    reports.value = result.reports;
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

watch(qrCanvas, (canvas) => {
  if (!canvas) return;
  const size = 480;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, size, size);
  drawQr(ctx, tagUrl(code), 24, 24, size - 48);
});

async function update(changes: Partial<Pick<Tag, "status" | "rewardNim">>) {
  busy.value = true;
  error.value = "";
  try {
    tag.value = await api.updateTag(session.token!, code, changes);
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function saveReward() {
  await update({ rewardNim: Math.max(0, Number(rewardDraft.value) || 0) });
  editingReward.value = false;
}

async function archive() {
  if (!window.confirm("Archive this tag? Its QR code will stop working for finders.")) return;
  await update({ status: "archived" });
  await router.replace("/");
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(tagUrl(code));
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    window.prompt("Copy this link", tagUrl(code));
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <PageHeader :title="tag?.label ?? 'Tag'" />

    <p v-if="error" class="error-text">{{ error }}</p>
    <div v-if="!tag && !error" class="center-state"><div class="spinner" /></div>

    <template v-if="tag">
      <section class="card qr-card">
        <canvas ref="qrCanvas" class="qr" aria-label="QR code for this tag" />
        <div class="row qr-meta">
          <span class="kind-badge small-badge"><Icon :name="KIND_ICONS[tag.kind]" :size="18" /></span>
          <span class="stack tight">
            <strong>{{ tag.label }}</strong>
            <span class="muted small">
              {{ tag.lastScanAt ? `Scanned ${tag.scanCount} ${tag.scanCount === 1 ? "time" : "times"}, last ${relativeTime(tag.lastScanAt)}` : "Not scanned yet" }}
            </span>
          </span>
          <span class="spacer" />
          <span v-if="tag.status === 'lost'" class="pill pill-red">Marked lost</span>
          <span v-else class="pill pill-green">Active</span>
        </div>
        <button class="btn btn-text" type="button" @click="copyLink">
          <Icon :name="copied ? 'check' : 'copy'" :size="14" /> {{ copied ? "Link copied" : "Copy finder link" }}
        </button>
      </section>

      <section class="stack">
        <RouterLink :to="`/app/tags/${code}/wallpaper`" class="list-item action">
          <span class="kind-badge action-icon gold"><Icon name="image" :size="20" /></span>
          <span class="stack tight">
            <strong>Lock screen wallpaper</strong>
            <span class="muted small">Your QR code inside a wallpaper, placed clear of widgets.</span>
          </span>
          <Icon name="chevron-right" :size="10" class="muted" />
        </RouterLink>
        <RouterLink :to="`/app/tags/${code}/stickers`" class="list-item action">
          <span class="kind-badge action-icon"><Icon name="printer" :size="20" /></span>
          <span class="stack tight">
            <strong>Printable tags</strong>
            <span class="muted small">Keychain tags, wallet cards and stickers on one A4 sheet.</span>
          </span>
          <Icon name="chevron-right" :size="10" class="muted" />
        </RouterLink>
      </section>

      <section class="card stack">
        <div class="row">
          <span class="stack tight">
            <span class="label">Reward</span>
            <strong v-if="!editingReward">{{ tag.rewardNim > 0 ? formatNim(tag.rewardNim) : "No reward" }}</strong>
          </span>
          <span class="spacer" />
          <button v-if="!editingReward" class="btn btn-text" type="button" @click="(rewardDraft = tag.rewardNim), (editingReward = true)">Change</button>
        </div>
        <form v-if="editingReward" class="row" @submit.prevent="saveReward">
          <input v-model.number="rewardDraft" class="input" type="number" min="0" inputmode="decimal" aria-label="Reward in NIM" />
          <button class="btn btn-primary" type="submit" :disabled="busy">Save</button>
        </form>

        <button
          v-if="tag.status !== 'lost'"
          class="btn btn-secondary btn-block"
          type="button"
          :disabled="busy"
          @click="update({ status: 'lost' })"
        >
          <Icon name="alert" :size="14" /> I lost it
        </button>
        <button v-else class="btn btn-secondary btn-block" type="button" :disabled="busy" @click="update({ status: 'active' })">
          <Icon name="check" :size="14" /> I have it again
        </button>
        <p class="hint">Marking it lost tells finders you are actively looking for it.</p>
      </section>

      <section class="stack">
        <h2 class="label">Finder messages</h2>
        <p v-if="reports.length === 0" class="muted small">No one has reported finding this yet.</p>
        <RouterLink v-for="report in reports" :key="report.id" :to="`/app/reports/${report.id}`" class="list-item">
          <span class="kind-badge small-badge"><Icon name="message" :size="18" /></span>
          <span class="stack tight">
            <strong>Found report</strong>
            <span class="muted small">{{ relativeTime(report.updatedAt) }}</span>
          </span>
          <span class="spacer" />
          <span v-if="report.rewardStatus === 'paid'" class="pill pill-green">Rewarded</span>
          <span v-else-if="report.status === 'open'" class="pill pill-blue">Open</span>
          <span v-else class="pill pill-neutral">{{ report.status === "returned" ? "Returned" : "Closed" }}</span>
        </RouterLink>
      </section>

      <button class="btn btn-text danger" type="button" :disabled="busy" @click="archive">
        <Icon name="trash" :size="14" /> Archive tag
      </button>
    </template>
  </main>
</template>

<style scoped>
.qr-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.qr {
  width: min(240px, 70%);
  aspect-ratio: 1;
  align-self: center;
  border-radius: 12px;
}

.qr-meta {
  padding-top: 4px;
}

.small-badge {
  width: 36px;
  height: 36px;
  border-radius: 11px;
}

.tight {
  gap: 2px;
}

.action-icon.gold {
  color: var(--nq-darkblue);
  background: rgba(233, 178, 19, 0.22);
}

.danger {
  color: var(--nq-red);
}
</style>
