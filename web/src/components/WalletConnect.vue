<script setup lang="ts">
import HubApi from "@nimiq/hub-api/dist/standalone/HubApi.standalone.es.js";
import { computed, ref } from "vue";
import { normalizeAddress } from "../lib/address";
import { shortAddress } from "../lib/format";
import Icon from "./Icon.vue";

const props = defineProps<{ address: string | null; network: "mainnet" | "testnet"; saving?: boolean; embedded?: boolean }>();
const emit = defineEmits<{ choose: [address: string, label: string | null] }>();

// Created up front: the Hub must be opened synchronously inside the tap, or browsers block the window.
const hub = computed(() => new HubApi(props.network === "testnet" ? "https://hub.nimiq-testnet.com" : "https://hub.nimiq.com"));
const walletLabel = ref<string | null>(null);
const pasting = ref(false);
const pasted = ref("");
const error = ref("");

function connect() {
  error.value = "";
  hub.value
    .chooseAddress({ appName: "NimFind" })
    .then((result) => {
      walletLabel.value = result.label;
      emit("choose", result.address, result.label);
    })
    .catch((e: Error) => {
      const text = String(e?.message ?? e).toLowerCase();
      if (/cancel|closed|abort/.test(text)) return;
      error.value = /popup|window|blocked/.test(text)
        ? "Your browser blocked the Nimiq window. Allow pop ups for this page, or paste an address instead."
        : "Could not connect the wallet. Please try again, or paste an address instead.";
    });
}

function usePasted() {
  const address = normalizeAddress(pasted.value);
  if (!address) {
    error.value = "That does not look like a valid Nimiq address. It starts with NQ and has 36 characters.";
    return;
  }
  error.value = "";
  pasting.value = false;
  emit("choose", address, null);
}
</script>

<template>
  <section class="stack wallet" :class="embedded ? 'embedded' : 'card'">
    <template v-if="address">
      <span class="label">Your reward goes to</span>
      <div class="row connected">
        <span class="wallet-icon done"><Icon name="check" :size="14" /></span>
        <span class="stack tight">
          <strong>{{ walletLabel ?? "Your Nimiq wallet" }}</strong>
          <span class="muted small mono">{{ shortAddress(address) }}</span>
        </span>
        <span class="spacer" />
        <button class="btn btn-text" type="button" :disabled="saving" @click="connect">Change</button>
      </div>
    </template>

    <template v-else>
      <strong class="row inline"><Icon v-if="!embedded" name="coins" :size="16" /> How you get your reward</strong>
      <p class="small muted">
        Rewards are paid in NIM, straight into your own Nimiq wallet. Creating one is free, takes about a minute, and
        works right here in your browser.
      </p>

      <button class="btn btn-primary btn-block" type="button" :disabled="saving" @click="connect">
        Create or connect a Nimiq wallet
      </button>

      <p class="small muted center">
        Prefer an app? Get Nimiq Pay for
        <a href="https://apps.apple.com/app/id6471844738" target="_blank" rel="noopener">iPhone</a> or
        <a href="https://play.google.com/store/apps/details?id=com.nimiq.pay" target="_blank" rel="noopener">Android</a>.
      </p>

      <button v-if="!pasting" class="btn btn-text" type="button" @click="pasting = true">I already have an address</button>
      <form v-else class="row paste" @submit.prevent="usePasted">
        <input v-model="pasted" class="input mono" placeholder="NQ.." autocomplete="off" spellcheck="false" aria-label="Your Nimiq address" />
        <button class="btn btn-secondary" type="submit" :disabled="!pasted.trim() || saving">Use</button>
      </form>
    </template>

    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>

<style scoped>
.wallet {
  gap: 12px;
}

/* Inside another card: separated by a hairline instead of its own card. */
.embedded {
  padding-top: 16px;
  border-top: 1px solid var(--nq-darkblue-10);
}

.inline {
  gap: 8px;
}

.tight {
  gap: 2px;
}

.center {
  text-align: center;
}

.connected {
  gap: 12px;
}

.wallet-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.wallet-icon.done {
  color: #fff;
  background: var(--nq-green);
}

.paste .input {
  flex: 1;
  min-width: 0;
}

.mono {
  font-family: "Fira Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  letter-spacing: 0.02em;
}
</style>
