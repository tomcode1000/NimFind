<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import PageHeader from "../components/PageHeader.vue";
import { api } from "../lib/api";
import { useAuthGuard, waitForConfirmation } from "../lib/composables";
import { errorMessage, explorerTxUrl, formatNim } from "../lib/format";
import { WalletError, payWithData } from "../lib/nimiq-pay";
import { loadConfig, session } from "../lib/session";

const router = useRouter();
const handleAuth = useAuthGuard();

const available = ref<boolean | null>(null);
const pass = ref<{ period: string; priceNim: number; active: boolean; txHash: string | null } | null>(null);
const state = ref<"idle" | "wallet" | "confirming" | "timeout">("idle");
const error = ref("");

const monthName = computed(() =>
  pass.value ? new Date(`${pass.value.period}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", timeZone: "UTC" }) : "",
);

async function checkPayment() {
  const result = await api.confirmPass(session.token!);
  if (result.data.active) pass.value = { ...pass.value!, active: true, txHash: result.data.txHash ?? null };
  return result.data.active;
}

async function buy() {
  error.value = "";
  try {
    state.value = "wallet";
    const payment = await api.preparePass(session.token!);
    await payWithData(payment);
    state.value = "confirming";
    state.value = (await waitForConfirmation(checkPayment)) ? "idle" : "timeout";
  } catch (e) {
    state.value = "idle";
    if (e instanceof WalletError && e.kind === "cancelled") return;
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

async function checkAgain() {
  state.value = "confirming";
  state.value = (await waitForConfirmation(checkPayment, 5).catch(() => false)) ? "idle" : "timeout";
}

onMounted(async () => {
  try {
    const config = await loadConfig();
    available.value = config.passAvailable;
    if (config.passAvailable) pass.value = await api.pass(session.token!);
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
});
</script>

<template>
  <main class="page">
    <PageHeader title="Designer Pass" />
    <p v-if="error" class="error-text">{{ error }}</p>

    <section class="card stack hero">
      <div class="hero-icon"><Icon name="star" :size="28" /></div>
      <h2 class="title">Make it yours</h2>
      <p class="muted">Designer wallpapers and a month calendar on your lock screen, so your tag looks good every day.</p>
      <ul class="perks">
        <li><Icon name="check" :size="14" /> Hexfield, Gold hour and Paper designs</li>
        <li><Icon name="check" :size="14" /> Month calendar layer, refreshed each month</li>
        <li><Icon name="check" :size="14" /> Supports an independent open source app</li>
      </ul>
    </section>

    <div v-if="available === null && !error" class="center-state"><div class="spinner" /></div>

    <section v-else-if="available === false" class="card stack">
      <strong>Coming soon</strong>
      <p class="small muted">The Designer Pass is not available yet. Midnight and your own photo are free to use.</p>
    </section>

    <section v-else-if="pass?.active" class="card stack active">
      <strong class="row inline"><Icon name="check" :size="16" /> Active for {{ monthName }}</strong>
      <p class="small muted">All designs and the calendar are unlocked until the end of the month.</p>
      <a v-if="pass.txHash" :href="explorerTxUrl(pass.txHash, session.config?.network ?? 'mainnet')" target="_blank" rel="noopener" class="btn btn-text">
        View payment <Icon name="arrow-top-right" :size="10" />
      </a>
      <button class="btn btn-primary btn-block" type="button" @click="router.back()">Back to my wallpaper</button>
    </section>

    <section v-else-if="pass" class="card stack">
      <div class="row">
        <span class="stack tight">
          <span class="label">{{ monthName }}</span>
          <strong class="price">{{ formatNim(pass.priceNim) }}</strong>
        </span>
      </div>
      <button v-if="state === 'idle'" class="btn btn-gold btn-block" type="button" @click="buy">Pay with Nimiq Pay</button>
      <div v-else-if="state === 'wallet'" class="row status-line"><div class="spinner" /> Confirm the payment in Nimiq Pay</div>
      <div v-else-if="state === 'confirming'" class="row status-line"><div class="spinner" /> Waiting for the Nimiq network</div>
      <div v-else class="stack">
        <p class="small muted">The payment is not visible on the network yet. This can take a minute.</p>
        <button class="btn btn-secondary btn-block" type="button" @click="checkAgain">Check again</button>
      </div>
      <p class="hint">One payment covers this calendar month. Nothing renews automatically.</p>
    </section>
  </main>
</template>

<style scoped>
.hero {
  align-items: flex-start;
  background:
    radial-gradient(80% 60% at 100% 0%, rgba(233, 178, 19, 0.18), transparent),
    #fff;
}

.hero-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nq-darkblue);
  background: var(--gradient-gold);
}

.perks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 15px;
}

.perks li {
  display: flex;
  gap: 10px;
  align-items: center;
}

.perks .icon {
  color: var(--nq-green);
}

.inline {
  gap: 8px;
}

.tight {
  gap: 2px;
}

.price {
  font-size: 24px;
}

.active {
  background: linear-gradient(135deg, rgba(33, 188, 165, 0.12), rgba(33, 188, 165, 0.04)), #fff;
}

.status-line {
  justify-content: center;
  font-weight: 700;
  min-height: 48px;
}
</style>
