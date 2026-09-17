<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import FinderHeader from "../components/FinderHeader.vue";
import FinderSteps from "../components/FinderSteps.vue";
import Icon from "../components/Icon.vue";
import MessageThread from "../components/MessageThread.vue";
import WalletConnect from "../components/WalletConnect.vue";
import { ApiError, api, type Message, type Report } from "../lib/api";
import { usePolling } from "../lib/composables";
import { errorMessage, explorerTxUrl, formatNim } from "../lib/format";
import { firstAccount, insideNimiqPay } from "../lib/nimiq-pay";
import { finderTokens, loadConfig, session } from "../lib/session";

const route = useRoute();
const id = String(route.params.id);

// The token lives in the URL fragment, which browsers never send to the server.
const hashToken = route.hash.replace(/^#/, "");
const token = hashToken || finderTokens.get(id) || "";
if (hashToken) finderTokens.set(id, hashToken);

const report = ref<Report | null>(null);
const messages = ref<Message[]>([]);
const notFound = ref(!token);
const error = ref("");
const sending = ref(false);
const savingAddress = ref(false);
const copied = ref(false);

const network = computed(() => session.config?.network ?? "mainnet");
const pageLink = computed(() => `${location.origin}/r/${id}#${token}`);

async function load() {
  if (!token) return;
  try {
    const result = await api.finderReport(id, token);
    report.value = result.report;
    messages.value = result.messages;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true;
    else error.value = errorMessage(e);
  }
}

async function send(body: string) {
  sending.value = true;
  try {
    messages.value.push(await api.finderMessage(id, token, body));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    sending.value = false;
  }
}

async function saveAddress(address: string) {
  savingAddress.value = true;
  error.value = "";
  try {
    // Update responses carry no tag details, so merge rather than replace.
    report.value = { ...report.value!, ...(await api.setFinderAddress(id, token, address)) };
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    savingAddress.value = false;
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(pageLink.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    window.prompt("Copy this link to come back later", pageLink.value);
  }
}

onMounted(async () => {
  void loadConfig().catch(() => undefined);
  await load();
  // Inside Nimiq Pay the finder already has a wallet, so use it without asking.
  if (insideNimiqPay() && report.value && !report.value.finderAddress && report.value.rewardNim > 0) {
    const account = await firstAccount();
    if (account) await saveAddress(account);
  }
});
usePolling(load, 10_000);
</script>

<template>
  <main class="page">
    <FinderHeader />

    <section v-if="notFound" class="center-state">
      <Icon name="locked-lock" :size="30" class="muted" />
      <strong>Conversation not found</strong>
      <p class="muted small">This private link is incomplete, or it was opened on a different device. Use the full link you saved.</p>
    </section>

    <div v-else-if="!report && !error" class="center-state"><div class="spinner" /></div>
    <p v-if="error" class="error-text">{{ error }}</p>

    <template v-if="report">
      <header class="stack tight">
        <h1 class="title">Thanks for helping</h1>
        <p class="muted">Your private conversation about <strong>{{ report.tag?.label }}</strong>.</p>
      </header>

      <FinderSteps
        :messaged="true"
        :returned="report.status === 'returned' || report.rewardStatus === 'paid'"
        :paid="report.rewardStatus === 'paid'"
      />

      <section class="card row save-link">
        <Icon name="info" :size="16" class="muted" />
        <span class="small">Save this page's link to come back to the chat later.</span>
        <span class="spacer" />
        <button class="btn btn-text" type="button" @click="copyLink">{{ copied ? "Copied" : "Copy link" }}</button>
      </section>

      <section v-if="report.rewardStatus === 'paid'" class="card stack paid">
        <strong class="row inline"><Icon name="check" :size="16" /> You received {{ formatNim(report.rewardPaidNim ?? 0) }}</strong>
        <p class="small muted">The owner sent your reward. Thank you for returning it.</p>
        <a v-if="report.rewardTxHash" :href="explorerTxUrl(report.rewardTxHash, network)" target="_blank" rel="noopener" class="btn btn-text">
          View transaction <Icon name="arrow-top-right" :size="10" />
        </a>
      </section>

      <section v-else-if="report.rewardNim > 0" class="card stack">
        <strong class="row inline"><Icon name="coins" :size="16" /> Reward: {{ formatNim(report.rewardNim) }}</strong>
        <p class="small muted">
          {{
            report.rewardStatus === "awaiting_payment"
              ? "The owner is sending your reward now."
              : report.finderAddress
                ? "The owner pays once they have the item back."
                : "Add a wallet below so the owner can pay you once they have the item back."
          }}
        </p>
        <WalletConnect
          embedded
        :address="report.finderAddress"
        :network="network"
        :saving="savingAddress || report.rewardStatus !== 'none'"
        @choose="(chosen) => saveAddress(chosen)"
        />
      </section>

      <MessageThread :messages="messages" me="finder" :sending="sending" placeholder="Message the owner" @send="send" />
    </template>
  </main>
</template>

<style scoped>

.tight {
  gap: 4px;
}

.inline {
  gap: 8px;
}

.save-link {
  gap: 10px;
  padding: 10px 12px 10px 16px;
}

.save-link .btn {
  white-space: nowrap;
}

.paid {
  background: linear-gradient(135deg, rgba(33, 188, 165, 0.12), rgba(33, 188, 165, 0.04)), #fff;
}

.paid .icon {
  color: var(--nq-green);
}

.mono {
  font-family: "Fira Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 14px;
  letter-spacing: 0.02em;
}
</style>
