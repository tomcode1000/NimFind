<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "../components/Icon.vue";
import LogoMark from "../components/LogoMark.vue";
import { api, type PublicTag, type WallpaperLinkOptions } from "../lib/api";
import { ensureFonts, saveImage } from "../lib/canvas";
import { errorMessage, tagUrl } from "../lib/format";
import { KIND_HEADLINES } from "../lib/kinds";
import { renderBackground, renderWallpaper, wallpaperSize, type DesignId, type PhotoFilter } from "../lib/wallpaper";

/**
 * Opened in the phone's normal browser from a signed link, where saving images works. It redraws
 * the exact wallpaper the owner designed in NimFind. Photos are chosen again here and never uploaded.
 */
const route = useRoute();
const linkToken = String(route.params.token);
const size = wallpaperSize();

const tag = ref<PublicTag | null>(null);
const options = ref<(WallpaperLinkOptions & { code: string }) | null>(null);
const photo = ref<HTMLImageElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref("");
const saving = ref(false);
const savedUrl = ref<string | null>(null);

const needsPhoto = computed(() => options.value?.design === "photo" && !photo.value);

function render() {
  if (!canvas.value || !tag.value || !options.value || needsPhoto.value) return;
  const background = document.createElement("canvas");
  renderBackground(
    background,
    options.value.design === "photo" && photo.value
      ? { kind: "photo", image: photo.value, filter: options.value.filter as PhotoFilter }
      : { kind: "design", design: options.value.design as DesignId },
    size.width,
    size.height,
  );
  renderWallpaper(canvas.value, background, {
    qrText: tagUrl(options.value.code),
    headline: KIND_HEADLINES[tag.value.kind],
    message: options.value.message,
    rewardNim: tag.value.rewardNim,
    x: options.value.x,
    y: options.value.y,
    contrast: options.value.contrast,
    calendar: options.value.calendar,
    date: new Date(),
  });
}

watch([canvas, photo, options], render);

function choosePhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => (photo.value = image);
  image.src = URL.createObjectURL(file);
}

async function save() {
  if (!canvas.value) return;
  saving.value = true;
  try {
    savedUrl.value = (await saveImage(canvas.value, `nimfind-${options.value?.code}-wallpaper.png`)).url;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await ensureFonts();
  try {
    const result = await api.publicWallpaper(linkToken);
    tag.value = result.tag;
    options.value = result.wallpaper;
  } catch (e) {
    error.value = errorMessage(e);
  }
});
</script>

<template>
  <main class="page">
    <header class="row brand"><LogoMark :size="28" /> NimFind</header>

    <p v-if="error" class="card error-text">{{ error }}</p>
    <div v-else-if="!options" class="center-state"><div class="spinner" /></div>

    <template v-else>
      <div class="stack tight">
        <h1 class="title">Save your wallpaper</h1>
        <p class="muted">Your lock screen for "{{ tag?.label }}", ready to save to this phone.</p>
      </div>

      <label v-if="needsPhoto" class="card upload">
        <input type="file" accept="image/*" hidden @change="choosePhoto" />
        <Icon name="image" :size="26" />
        <strong>Choose the same photo again</strong>
        <span class="hint">Photos never leave your phone, so NimFind cannot send them to this page.</span>
      </label>

      <div v-show="!needsPhoto" class="preview-wrap">
        <canvas ref="canvas" class="preview" :style="{ aspectRatio: `${size.width} / ${size.height}` }" />
      </div>

      <button v-if="!needsPhoto" class="btn btn-primary btn-block" type="button" :disabled="saving" @click="save">
        <Icon name="arrow-to-bottom" :size="14" /> {{ saving ? "Preparing image" : "Save to this phone" }}
      </button>

      <section v-if="savedUrl" class="card stack small">
        <strong>Set it as your lock screen</strong>
        <ol class="instructions">
          <li><strong>Android:</strong> open the image in Photos or Gallery, tap the menu, choose Use as or Set as wallpaper, then pick Lock screen.</li>
          <li><strong>iPhone:</strong> open the image in Photos, tap Share, choose Use as Wallpaper, then pick Lock Screen.</li>
          <li>If nothing was saved, press and hold the preview above and choose Download image or Save.</li>
        </ol>
      </section>
    </template>
  </main>
</template>

<style scoped>
.brand {
  gap: 8px;
  font-weight: 800;
  font-size: 16px;
}

.tight {
  gap: 4px;
}

.upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  text-align: center;
  cursor: pointer;
}

.preview-wrap {
  display: flex;
  justify-content: center;
}

.preview {
  width: min(70vw, 280px);
  height: auto;
  border-radius: 28px;
  box-shadow:
    0 0 0 6px #11132a,
    0 18px 40px rgba(31, 35, 72, 0.3);
}

.instructions {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.45;
}
</style>
