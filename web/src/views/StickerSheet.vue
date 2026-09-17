<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import Icon from "../components/Icon.vue";
import PageHeader from "../components/PageHeader.vue";
import { api, type Tag } from "../lib/api";
import { ensureFonts, saveImage } from "../lib/canvas";
import { useAuthGuard } from "../lib/composables";
import { errorMessage, tagUrl } from "../lib/format";
import { KIND_HEADLINES } from "../lib/kinds";
import { session } from "../lib/session";
import { renderStickerSheet } from "../lib/stickers";

const route = useRoute();
const handleAuth = useAuthGuard();
const code = String(route.params.code);

const tag = ref<Tag | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref("");
const saving = ref(false);
const savedUrl = ref<string | null>(null);

async function save() {
  if (!canvas.value) return;
  saving.value = true;
  try {
    savedUrl.value = (await saveImage(canvas.value, `nimfind-${code}-print.png`)).url;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await ensureFonts();
  try {
    tag.value = (await api.tag(session.token!, code)).tag;
    if (canvas.value) {
      renderStickerSheet(canvas.value, {
        qrText: tagUrl(code),
        linkText: tagUrl(code),
        code,
        label: tag.value.label,
        headline: KIND_HEADLINES[tag.value.kind],
        rewardNim: tag.value.rewardNim,
      });
    }
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
});
</script>

<template>
  <main class="page">
    <PageHeader title="Printable tags" :back="`/app/tags/${code}`" />
    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="sheet card">
      <canvas ref="canvas" class="sheet-canvas" aria-label="Printable A4 sheet of QR tags" />
    </div>

    <section class="card stack small">
      <strong>How to use it</strong>
      <ol class="instructions">
        <li>Save the sheet and print it on A4 paper or sticker paper, at 100% or "fit to page".</li>
        <li>Cut along the dotted lines.</li>
        <li>Keychain tags: cover both sides with clear tape and attach them to a key ring.</li>
        <li>Cards go in your wallet or a luggage tag holder. Stickers fit laptops, bottles and cases.</li>
        <li>Test one: scan it with your phone camera before you rely on it.</li>
      </ol>
    </section>

    <button class="btn btn-primary btn-block" type="button" :disabled="saving || !tag" @click="save">
      <Icon name="arrow-to-bottom" :size="14" /> {{ saving ? "Preparing image" : "Save printable sheet" }}
    </button>
    <p v-if="savedUrl" class="hint">If it did not save, press and hold the sheet above and choose Save, or open this page on a computer.</p>
  </main>
</template>

<style scoped>
.sheet {
  padding: 10px;
}

.sheet-canvas {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0 0 0 1px var(--nq-darkblue-10);
}

.instructions {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.45;
}
</style>
