<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import FinderHeader from "../components/FinderHeader.vue";
import FinderSteps from "../components/FinderSteps.vue";
import Icon from "../components/Icon.vue";
import WalletConnect from "../components/WalletConnect.vue";
import { ApiError, api, type PublicTag } from "../lib/api";
import { errorMessage, formatNim } from "../lib/format";
import { KIND_HEADLINES, KIND_ICONS } from "../lib/kinds";
import { firstAccount, insideNimiqPay } from "../lib/nimiq-pay";
import { finderTokens, loadConfig, session } from "../lib/session";

const route = useRoute();
const router = useRouter();
const code = String(route.params.code).toLowerCase();

const tag = ref<PublicTag | null>(null);
const notFound = ref(false);
const message = ref("");
const address = ref<string | null>(null);
const sending = ref(false);
const error = ref("");

const network = computed(() => session.config?.network ?? "mainnet");

async function submit() {
  if (!message.value.trim() || sending.value) return;
  sending.value = true;
  error.value = "";
  try {
    const result = await api.openReport(code, {
      message: message.value.trim(),
      finderAddress: address.value ?? undefined,
    });
    finderTokens.set(result.reportId, result.finderToken);
    await router.replace({ path: `/r/${result.reportId}`, hash: `#${result.finderToken}` });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  void loadConfig().catch(() => undefined);
  try {
    tag.value = await api.publicTag(code);
    // Lets the owner know someone is looking at their tag right now.
    void api.recordScan(code, session.token).catch(() => undefined);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true;
    else error.value = errorMessage(e);
  }
  if (insideNimiqPay()) address.value = await firstAccount();
});
</script>

<template>
  <main class="page">
    <FinderHeader />

    <section v-if="notFound" class="center-state">
      <Icon name="alert" :size="32" class="muted" />
      <strong>This tag is not active</strong>
      <p class="muted small">The owner may have archived it. If you found an item, consider handing it to a nearby lost and found desk.</p>
    </section>

    <div v-else-if="!tag && !error" class="center-state"><div class="spinner" /></div>
    <p v-if="error && !tag" class="error-text">{{ error }}</p>

    <template v-if="tag">
      <section class="hero">
        <span class="hero-icon"><Icon :name="KIND_ICONS[tag.kind]" :size="26" /></span>
        <div class="stack tight">
          <h1 class="title">{{ KIND_HEADLINES[tag.kind] }}</h1>
          <p class="item-name">{{ tag.label }}</p>
        </div>
      </section>
      <p v-if="tag.markedLost" class="lost-banner"><Icon name="alert" :size="12" /> The owner has marked this as lost and is looking for it.</p>

      <FinderSteps :messaged="false" :returned="false" :paid="false" />

      <section v-if="tag.rewardNim > 0" class="card reward stack">
        <div class="row reward-row">
          <span class="stack tight">
            <span class="label">Reward for returning it</span>
            <strong class="reward-amount">{{ formatNim(tag.rewardNim) }}</strong>
          </span>
          <span class="reward-icon"><Icon name="coins" :size="22" /></span>
        </div>
        <p v-if="tag.rewardFunded" class="row funded small">
          <Icon name="check" :size="12" /> The owner's wallet holds this reward right now.
        </p>
        <p class="small muted">The owner pays it straight to your wallet once the item is back with them.</p>
        <WalletConnect embedded :address="address" :network="network" @choose="(chosen) => (address = chosen)" />
      </section>

      <section v-if="tag.note" class="card stack">
        <span class="label">Note from the owner</span>
        <p class="note">{{ tag.note }}</p>
      </section>

      <form class="card stack" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">Message the owner</span>
          <textarea
            v-model="message"
            class="textarea"
            maxlength="1000"
            required
            placeholder="Where did you find it, and how can the owner get it back?"
          />
        </label>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button class="btn btn-primary btn-block" type="submit" :disabled="!message.trim() || sending">
          {{ sending ? "Sending" : "Send to the owner" }}
        </button>
        <p class="hint center">
          <Icon name="locked-lock" :size="11" /> Only the owner reads this. Neither of you sees the other's phone number.
        </p>
      </form>

      <p v-if="tag.rewardNim > 0 && !address" class="hint center">No wallet yet? You can add one later, from your chat page.</p>
    </template>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0 0;
}

.hero-icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--nq-gold);
  background: var(--gradient-darkblue);
  box-shadow: 0 10px 24px rgba(31, 35, 72, 0.22);
}

.item-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--nq-darkblue-60);
}

.lost-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--nq-red);
  background: rgba(217, 68, 50, 0.08);
}

.reward {
  gap: 10px;
  background:
    linear-gradient(180deg, rgba(233, 178, 19, 0.12), rgba(233, 178, 19, 0) 120px),
    #fff;
  box-shadow:
    inset 0 3px 0 var(--nq-gold),
    var(--shadow-card);
}

.reward-row {
  justify-content: space-between;
}

.reward-icon {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--nq-darkblue);
  background: var(--gradient-gold);
}

.reward-amount {
  font-size: 30px;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.funded {
  gap: 6px;
  font-weight: 700;
  color: #148a79;
}

.tight {
  gap: 2px;
}

.note {
  white-space: pre-wrap;
  line-height: 1.5;
}

.center {
  text-align: center;
}
</style>
