<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import Icon from "../components/Icon.vue";
import MessageThread from "../components/MessageThread.vue";
import PageHeader from "../components/PageHeader.vue";
import { api, type Message, type Report } from "../lib/api";
import { useAuthGuard, usePolling, waitForConfirmation } from "../lib/composables";
import { errorMessage, explorerTxUrl, formatNim, shortAddress } from "../lib/format";
import { WalletError, payWithData } from "../lib/nimiq-pay";
import { session } from "../lib/session";

const route = useRoute();
const handleAuth = useAuthGuard();
const id = String(route.params.id);

const report = ref<Report | null>(null);
const messages = ref<Message[]>([]);
const error = ref("");
const sending = ref(false);
const amount = ref<number>(0);
const paying = ref<"idle" | "wallet" | "confirming" | "timeout">("idle");

const network = computed(() => session.config?.network ?? "mainnet");

async function load() {
  try {
    const result = await api.ownerReport(session.token!, id);
    if (!report.value) amount.value = result.report.rewardNim;
    report.value = result.report;
    messages.value = result.messages;
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

async function send(body: string) {
  sending.value = true;
  try {
    messages.value.push(await api.ownerMessage(session.token!, id, body));
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  } finally {
    sending.value = false;
  }
}

async function checkPayment(): Promise<boolean> {
  const result = await api.confirmReward(session.token!, id);
  // Update responses carry no tag details, so merge rather than replace.
  report.value = { ...report.value!, ...result.data.report };
  return result.data.report.rewardStatus === "paid";
}

async function payReward() {
  error.value = "";
  try {
    paying.value = "wallet";
    const payment = await api.prepareReward(session.token!, id, amount.value);
    await payWithData(payment);
    paying.value = "confirming";
    paying.value = (await waitForConfirmation(checkPayment)) ? "idle" : "timeout";
  } catch (e) {
    paying.value = "idle";
    if (e instanceof WalletError && e.kind === "cancelled") return;
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

async function checkAgain() {
  paying.value = "confirming";
  try {
    paying.value = (await waitForConfirmation(checkPayment, 5)) ? "idle" : "timeout";
  } catch (e) {
    paying.value = "timeout";
    error.value = errorMessage(e);
  }
}

async function setStatus(status: Report["status"]) {
  try {
    report.value = { ...report.value!, ...(await api.setReportStatus(session.token!, id, status)) };
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

onMounted(load);
usePolling(load, 10_000);
</script>

<template>
  <main class="page">
    <PageHeader :title="report?.tag?.label ?? 'Found report'" back="/app/inbox" />
    <p v-if="error" class="error-text">{{ error }}</p>
    <div v-if="!report && !error" class="center-state"><div class="spinner" /></div>

    <template v-if="report">
      <!-- Reward -->
      <section v-if="report.rewardStatus === 'paid'" class="card stack paid">
        <strong class="row inline"><Icon name="check" :size="16" /> Reward sent: {{ formatNim(report.rewardPaidNim ?? 0) }}</strong>
        <p class="small muted">Confirmed on the Nimiq blockchain. Thank you for rewarding an honest finder.</p>
        <a v-if="report.rewardTxHash" :href="explorerTxUrl(report.rewardTxHash, network)" target="_blank" rel="noopener" class="btn btn-text">
          View transaction <Icon name="arrow-top-right" :size="10" />
        </a>
      </section>

      <section v-else-if="!report.finderAddress" class="card stack">
        <strong class="row inline"><Icon name="info" :size="16" /> Reward</strong>
        <p class="small muted">
          The finder has not added a Nimiq address yet. Once you have your item back, ask them in the chat to add one on their page.
        </p>
      </section>

      <section v-else class="card stack">
        <strong class="row inline"><Icon name="coins" :size="16" /> Send the reward</strong>
        <p class="small muted">To the finder at {{ shortAddress(report.finderAddress) }}. Pay once you have your item back.</p>
        <div class="reward-input">
          <input v-model.number="amount" class="input" type="number" min="1" inputmode="decimal" aria-label="Reward amount in NIM" :disabled="paying !== 'idle'" />
          <span class="unit">NIM</span>
        </div>
        <button v-if="paying === 'idle'" class="btn btn-gold btn-block" type="button" :disabled="!amount || amount <= 0" @click="payReward">
          Pay {{ formatNim(amount || 0) }} with Nimiq Pay
        </button>
        <div v-else-if="paying === 'wallet'" class="row status-line"><div class="spinner" /> Confirm the payment in Nimiq Pay</div>
        <div v-else-if="paying === 'confirming'" class="row status-line"><div class="spinner" /> Waiting for the Nimiq network</div>
        <div v-else class="stack">
          <p class="small muted">The payment is not visible on the network yet. This can take a minute.</p>
          <button class="btn btn-secondary btn-block" type="button" @click="checkAgain">Check again</button>
        </div>
      </section>

      <!-- Conversation -->
      <MessageThread :messages="messages" me="owner" :sending="sending" placeholder="Reply to the finder" @send="send" />

      <div class="row actions">
        <button v-if="report.status !== 'returned'" class="btn btn-secondary" type="button" @click="setStatus('returned')">
          <Icon name="check" :size="12" /> I got it back
        </button>
        <button v-if="report.status === 'open'" class="btn btn-text muted" type="button" @click="setStatus('closed')">Close report</button>
        <button v-else class="btn btn-text" type="button" @click="setStatus('open')">Reopen</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.inline {
  gap: 8px;
}

.paid {
  background: linear-gradient(135deg, rgba(33, 188, 165, 0.12), rgba(33, 188, 165, 0.04)), #fff;
}

.paid .icon {
  color: var(--nq-green);
}

.reward-input {
  position: relative;
}

.reward-input .input {
  padding-right: 56px;
}

.unit {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-weight: 800;
  color: var(--nq-darkblue-60);
}

.status-line {
  justify-content: center;
  font-weight: 700;
  min-height: 48px;
}

.actions {
  flex-wrap: wrap;
  justify-content: space-between;
}
</style>
