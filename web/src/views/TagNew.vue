<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import PageHeader from "../components/PageHeader.vue";
import { api, type TagKind } from "../lib/api";
import { useAuthGuard } from "../lib/composables";
import { KIND_LABELS, errorMessage } from "../lib/format";
import { KIND_ICONS } from "../lib/kinds";
import { session } from "../lib/session";

const router = useRouter();
const handleAuth = useAuthGuard();

const kinds = Object.keys(KIND_LABELS) as TagKind[];
const kind = ref<TagKind>("phone");
const label = ref("");
const rewardNim = ref<number | null>(5000);
const note = ref("");
const saving = ref(false);
const error = ref("");

const placeholders: Record<TagKind, string> = {
  phone: "My phone",
  keys: "House keys",
  bag: "Black backpack",
  wallet: "Brown wallet",
  laptop: "Work laptop",
  other: "Headphones",
};

const canSave = computed(() => label.value.trim().length > 0 && (rewardNim.value ?? 0) >= 0 && !saving.value);

async function save() {
  if (!canSave.value || !session.token) return;
  saving.value = true;
  error.value = "";
  try {
    const tag = await api.createTag(session.token, {
      kind: kind.value,
      label: label.value.trim(),
      note: note.value.trim() || undefined,
      rewardNim: rewardNim.value ?? 0,
    });
    await router.replace(`/app/tags/${tag.code}`);
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="page">
    <PageHeader title="New tag" />

    <form class="stack" @submit.prevent="save">
      <section class="field">
        <span class="field-label">What is it?</span>
        <div class="kind-grid">
          <button
            v-for="k in kinds"
            :key="k"
            type="button"
            class="kind-option"
            :class="{ selected: kind === k }"
            :aria-pressed="kind === k"
            @click="kind = k"
          >
            <Icon :name="KIND_ICONS[k]" :size="22" />
            <span>{{ KIND_LABELS[k] }}</span>
          </button>
        </div>
      </section>

      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="label" class="input" maxlength="60" :placeholder="placeholders[kind]" required />
        <span class="hint">Finders see this name.</span>
      </label>

      <label class="field">
        <span class="field-label">Reward for the finder</span>
        <div class="reward-input">
          <input v-model.number="rewardNim" class="input" type="number" inputmode="decimal" min="0" step="1" />
          <span class="unit">NIM</span>
        </div>
        <div class="row chips">
          <button v-for="amount in [1000, 5000, 20000]" :key="amount" type="button" class="pill pill-neutral chip" @click="rewardNim = amount">
            {{ new Intl.NumberFormat("en").format(amount) }}
          </button>
        </div>
        <span class="hint">You only pay if the item comes back to you. You can change it any time.</span>
      </label>

      <label class="field">
        <span class="field-label">Note for the finder <span class="muted">(optional)</span></span>
        <textarea v-model="note" class="textarea" maxlength="280" placeholder="For example: please leave it at the front desk of my building." />
      </label>

      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="btn btn-primary btn-block" type="submit" :disabled="!canSave">{{ saving ? "Creating tag" : "Create tag" }}</button>
    </form>
  </main>
</template>

<style scoped>
.kind-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.kind-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 6px;
  border-radius: 14px;
  border: 1.5px solid transparent;
  background: #fff;
  box-shadow: var(--shadow-card);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.kind-option.selected {
  border-color: var(--nq-light-blue);
  color: var(--nq-blue);
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

.chips {
  gap: 8px;
}

.chip {
  border: 0;
  cursor: pointer;
  padding: 6px 12px;
}
</style>
