<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import LogoMark from "../components/LogoMark.vue";
import Landing from "./Landing.vue";
import { api, type Tag } from "../lib/api";
import { useAuthGuard, usePolling } from "../lib/composables";
import { errorMessage, formatNim, relativeTime } from "../lib/format";
import { KIND_ICONS } from "../lib/kinds";
import { WalletError, insideNimiqPay } from "../lib/nimiq-pay";
import { session, signIn, signOut } from "../lib/session";

const inWallet = insideNimiqPay();
const tags = ref<Tag[] | null>(null);
const signingIn = ref(false);
const error = ref("");
const handleAuth = useAuthGuard();

const openReports = computed(() => (tags.value ?? []).reduce((sum, tag) => sum + (tag.openReports ?? 0), 0));
const DAY_MS = 24 * 60 * 60 * 1000;

async function loadTags() {
  if (!session.token) return;
  try {
    tags.value = await api.tags(session.token);
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

function recentlyScanned(tag: Tag): boolean {
  return Boolean(tag.lastScanAt && Date.now() - tag.lastScanAt < DAY_MS);
}


usePolling(loadTags, 20_000);

async function startSignIn() {
  signingIn.value = true;
  error.value = "";
  try {
    await signIn();
    await loadTags();
  } catch (e) {
    if (!(e instanceof WalletError && e.kind === "cancelled")) error.value = errorMessage(e);
  } finally {
    signingIn.value = false;
  }
}

onMounted(() => {
  if (inWallet) void loadTags();
});
</script>

<template>
  <!-- Inside Nimiq Pay, signed in: the owner's tags -->
  <main v-if="inWallet && session.token" class="page">
    <header class="row">
      <LogoMark :size="36" />
      <h1 class="title">Your tags</h1>
      <span class="spacer" />
      <RouterLink to="/app/inbox" class="icon-btn inbox-btn" aria-label="Messages from finders">
        <Icon name="message" :size="18" />
        <span v-if="openReports" class="badge">{{ openReports }}</span>
      </RouterLink>
    </header>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div v-if="tags === null" class="center-state"><div class="spinner" /></div>

    <section v-else-if="tags.length === 0" class="card empty stack">
      <div class="empty-art"><Icon name="qr" :size="40" /></div>
      <h2 class="subtitle">Tag the things you carry</h2>
      <p class="muted small">
        Put a QR code on your keys, bag or phone lock screen. If someone finds it, they can message you here, and you can
        thank them with a NIM reward.
      </p>
      <RouterLink to="/app/tags/new" class="btn btn-primary btn-block"><Icon name="plus" :size="12" /> Create your first tag</RouterLink>
    </section>

    <template v-else>
      <RouterLink v-for="tag in tags" :key="tag.code" :to="`/app/tags/${tag.code}`" class="list-item">
        <span class="kind-badge"><Icon :name="KIND_ICONS[tag.kind]" :size="22" /></span>
        <span class="stack tight">
          <strong>{{ tag.label }}</strong>
          <span v-if="recentlyScanned(tag)" class="small scanned">Scanned {{ relativeTime(tag.lastScanAt!) }}</span>
          <span v-else class="muted small">{{ tag.rewardNim > 0 ? `Reward ${formatNim(tag.rewardNim)}` : "No reward set" }}</span>
        </span>
        <span class="spacer" />
        <span v-if="tag.openReports" class="pill pill-blue">{{ tag.openReports }} new</span>
        <span v-else-if="tag.status === 'lost'" class="pill pill-red">Lost</span>
        <Icon name="chevron-right" :size="10" class="muted" />
      </RouterLink>
      <RouterLink to="/app/tags/new" class="btn btn-secondary btn-block"><Icon name="plus" :size="12" /> New tag</RouterLink>
    </template>


    <footer class="row footer">
      <span class="spacer" />
      <button class="btn btn-text muted" type="button" @click="signOut">Sign out</button>
    </footer>
  </main>

  <!-- Inside Nimiq Pay, signed out -->
  <main v-else-if="inWallet" class="page">
    <section class="hero stack">
      <LogoMark :size="72" />
      <h1 class="title">NimFind</h1>
      <p class="muted">Lost and found for the things you carry, with rewards in NIM.</p>
    </section>

    <ol class="steps card">
      <li><Icon name="qr" :size="18" /><span>Create a QR tag for your keys, bag or phone.</span></li>
      <li><Icon name="image" :size="18" /><span>Put it on a lock screen wallpaper or a printed sticker.</span></li>
      <li><Icon name="message" :size="18" /><span>Finders message you privately. No phone numbers shared.</span></li>
      <li><Icon name="coins" :size="18" /><span>Thank them with a NIM reward, straight from your wallet.</span></li>
    </ol>

    <p v-if="error" class="error-text">{{ error }}</p>
    <button class="btn btn-primary btn-block" type="button" :disabled="signingIn" @click="startSignIn">
      {{ signingIn ? "Waiting for Nimiq Pay" : "Sign in with Nimiq Pay" }}
    </button>
    <p class="muted small center">Signing in proves you own your wallet. It never moves funds.</p>
  </main>

  <!-- Any other browser: the public landing page -->
  <Landing v-else />
</template>

<style scoped>
.hero {
  align-items: center;
  text-align: center;
  padding: 32px 8px 8px;
}

.steps {
  list-style: none;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.steps li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  font-size: 15px;
  line-height: 1.4;
}

.steps li .icon {
  color: var(--nq-blue);
  margin-top: 1px;
}

.center {
  text-align: center;
}

.tight {
  gap: 2px;
}

.empty {
  align-items: center;
  text-align: center;
  padding: 28px 20px;
}

.empty-art {
  width: 84px;
  height: 84px;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nq-darkblue);
  background: var(--nq-darkblue-5);
}

.inbox-btn {
  position: relative;
}

.scanned {
  font-weight: 800;
  color: var(--nq-blue);
}


.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  background: var(--nq-red);
  display: flex;
  align-items: center;
  justify-content: center;
}

.footer {
  margin-top: 8px;
}

</style>
