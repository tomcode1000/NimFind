<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "../components/Icon.vue";
import PageHeader from "../components/PageHeader.vue";
import { api, type Tag } from "../lib/api";
import { canvasToBlob, ensureFonts, saveImage } from "../lib/canvas";
import { useAuthGuard, waitForConfirmation } from "../lib/composables";
import { errorMessage, tagUrl } from "../lib/format";
import { KIND_HEADLINES } from "../lib/kinds";
import { WalletError, insideNimiqPay, payWithData } from "../lib/nimiq-pay";
import { loadConfig, session } from "../lib/session";
import {
  DESIGNS,
  PHOTO_FILTERS,
  renderBackground,
  renderWallpaper,
  wallpaperSize,
  type BlockLayout,
  type DesignId,
  type PhotoFilter,
  type WallpaperBackground,
} from "../lib/wallpaper";

const route = useRoute();
const handleAuth = useAuthGuard();
const code = String(route.params.code);
const size = wallpaperSize();

const tag = ref<Tag | null>(null);
/** Designer wallpapers are paid for one at a time. A credit is spent when the wallpaper is saved. */
const credits = ref(0);
const price = ref(100);
const paymentsAvailable = ref(false);
const paying = ref<"idle" | "wallet" | "confirming" | "timeout">("idle");
/** The wallpaper already saved for this tag. A paid one never costs again. */
const savedDesign = ref<{ design: string; calendar: boolean; paid: boolean } | null>(null);
const reopened = ref(false);
const error = ref("");

const source = ref<"design" | "photo">("design");
const design = ref<DesignId>("midnight");
const photo = ref<HTMLImageElement | null>(null);
const filter = ref<PhotoFilter>("original");

const options = reactive({
  message: "Scan to message the owner. No phone numbers shared.",
  contrast: "blend" as "blend" | "strong",
  calendar: false,
  // Left side, between the clock and the notification stack.
  x: 0.07,
  y: 0.37,
});
const showGuides = ref(true);

const preview = ref<HTMLCanvasElement | null>(null);
const backgroundCanvas = document.createElement("canvas");
const layout = ref<BlockLayout | null>(null);
const saving = ref(false);
const saved = ref<{ url: string } | null>(null);
const designSwatches = ref<Record<string, string>>({});
const filterSwatches = ref<Record<string, string>>({});

const background = computed<WallpaperBackground | null>(() =>
  source.value === "photo" && photo.value
    ? { kind: "photo", image: photo.value, filter: filter.value }
    : { kind: "design", design: design.value },
);

const premiumSelected = computed(
  () => options.calendar || (background.value?.kind === "design" && DESIGNS.find((d) => d.id === design.value)?.premium === true),
);
const alreadyPaid = computed(
  () => savedDesign.value?.paid === true && savedDesign.value.design === design.value && savedDesign.value.calendar === options.calendar,
);
const locked = computed(() => premiumSelected.value && paymentsAvailable.value && credits.value < 1 && !alreadyPaid.value);

/* Rendering: the background is cached so dragging only redraws the overlay. */

let backgroundDirty = true;
let frame = 0;
function scheduleRender(redrawBackground = false) {
  backgroundDirty ||= redrawBackground;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!preview.value || !tag.value || !background.value) return;
    if (backgroundDirty) {
      renderBackground(backgroundCanvas, background.value, size.width, size.height);
      backgroundDirty = false;
    }
    layout.value = renderWallpaper(preview.value, backgroundCanvas, {
      qrText: tagUrl(code),
      headline: KIND_HEADLINES[tag.value.kind],
      message: options.message,
      rewardNim: tag.value.rewardNim,
      x: options.x,
      y: options.y,
      contrast: options.contrast,
      calendar: options.calendar,
      date: new Date(),
    });
  });
}

watch(background, () => scheduleRender(true));
watch([options, preview, tag], () => scheduleRender(), { deep: true });
onUnmounted(() => cancelAnimationFrame(frame));

function swatch(bg: WallpaperBackground): string {
  const canvas = document.createElement("canvas");
  renderBackground(canvas, bg, 120, 260);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/* Dragging the code block around the preview */

let drag: { dx: number; dy: number } | null = null;
const dragging = ref(false);

function pointerFraction(event: PointerEvent) {
  const rect = preview.value!.getBoundingClientRect();
  return { px: (event.clientX - rect.left) / rect.width, py: (event.clientY - rect.top) / rect.height };
}

function onPointerDown(event: PointerEvent) {
  if (!layout.value) return;
  const { px, py } = pointerFraction(event);
  const b = layout.value;
  const inside = px >= b.x - 0.03 && px <= b.x + b.w + 0.03 && py >= b.y - 0.02 && py <= b.y + b.h + 0.02;
  // Tapping elsewhere moves the block there; pressing on it picks it up where it was grabbed.
  drag = inside ? { dx: px - b.x, dy: py - b.y } : { dx: b.w / 2, dy: b.h / 2 };
  dragging.value = true;
  preview.value!.setPointerCapture(event.pointerId);
  onPointerMove(event);
}

function onPointerMove(event: PointerEvent) {
  if (!drag || !layout.value) return;
  const { px, py } = pointerFraction(event);
  options.x = Math.min(Math.max(px - drag.dx, 0), 1 - layout.value.w);
  options.y = Math.min(Math.max(py - drag.dy, 0), 1 - layout.value.h);
}

function onPointerUp() {
  drag = null;
  dragging.value = false;
}

/* Photo */

function choosePhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    photo.value = image;
    source.value = "photo";
    filterSwatches.value = Object.fromEntries(PHOTO_FILTERS.map((f) => [f.id, swatch({ kind: "photo", image, filter: f.id })]));
  };
  image.src = URL.createObjectURL(file);
}

const inWallet = insideNimiqPay();
const browserLink = ref<string | null>(null);
const linkCopied = ref(false);

/**
 * Nimiq Pay's in app browser cannot save images, so there the owner gets a signed link to finish in
 * their normal browser. Elsewhere the image is shared or downloaded directly.
 */
async function save() {
  if (!preview.value || locked.value) return;
  saving.value = true;
  error.value = "";
  try {
    if (inWallet) {
      const path = await api.createWallpaperLink(session.token!, {
        code,
        design: source.value === "photo" && photo.value ? "photo" : design.value,
        filter: filter.value,
        x: options.x,
        y: options.y,
        contrast: options.contrast,
        calendar: options.calendar,
        message: options.message,
      });
      browserLink.value = `${location.origin}${path}`;
      if (premiumSelected.value && paymentsAvailable.value && !alreadyPaid.value) credits.value = Math.max(credits.value - 1, 0);
      savedDesign.value = {
        design: source.value === "photo" && photo.value ? "photo" : design.value,
        calendar: options.calendar,
        paid: premiumSelected.value || alreadyPaid.value,
      };
    }
    const canvas = preview.value;
    saved.value = { url: URL.createObjectURL(await canvasToBlob(canvas)) };
    if (!inWallet) await saveImage(canvas, `nimfind-${code}-wallpaper.png`);
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function checkPayment(): Promise<boolean> {
  const result = await api.confirmWallpaperPayment(session.token!);
  credits.value = result.data.credits;
  return result.data.paid;
}

async function payForWallpaper() {
  error.value = "";
  try {
    paying.value = "wallet";
    await payWithData(await api.prepareWallpaperPayment(session.token!));
    paying.value = "confirming";
    paying.value = (await waitForConfirmation(checkPayment)) ? "idle" : "timeout";
  } catch (e) {
    paying.value = "idle";
    if (e instanceof WalletError && e.kind === "cancelled") return;
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
}

async function checkPaymentAgain() {
  paying.value = "confirming";
  try {
    paying.value = (await waitForConfirmation(checkPayment, 5)) ? "idle" : "timeout";
  } catch (e) {
    paying.value = "timeout";
    error.value = errorMessage(e);
  }
}

function openInBrowser() {
  if (browserLink.value) window.open(browserLink.value, "_blank");
}

async function copyBrowserLink() {
  if (!browserLink.value) return;
  try {
    await navigator.clipboard.writeText(browserLink.value);
    linkCopied.value = true;
    setTimeout(() => (linkCopied.value = false), 2500);
  } catch {
    window.prompt("Copy this link and open it in Chrome or Safari", browserLink.value);
  }
}

onMounted(async () => {
  await ensureFonts();
  designSwatches.value = Object.fromEntries(DESIGNS.map((d) => [d.id, swatch({ kind: "design", design: d.id })]));
  try {
    const [tagResult, config] = await Promise.all([api.tag(session.token!, code), loadConfig()]);
    tag.value = tagResult.tag;
    price.value = config.wallpaperPriceNim;
    paymentsAvailable.value = config.paymentsAvailable;
    if (config.paymentsAvailable) credits.value = (await api.wallpaperCredits(session.token!)).credits;

    const previous = (await api.savedWallpaper(session.token!, code)).wallpaper;
    if (previous) {
      savedDesign.value = { design: previous.design, calendar: previous.calendar, paid: previous.paid };
      // Photos live on the phone, so a photo wallpaper reopens on its design tab instead.
      if (previous.design !== "photo") design.value = previous.design as DesignId;
      filter.value = previous.filter as PhotoFilter;
      options.x = previous.x;
      options.y = previous.y;
      options.contrast = previous.contrast;
      options.calendar = previous.calendar;
      options.message = previous.message;
      reopened.value = true;
    }
  } catch (e) {
    if (!handleAuth(e)) error.value = errorMessage(e);
  }
});
</script>

<template>
  <main class="page">
    <PageHeader title="Lock screen wallpaper" :back="`/app/tags/${code}`" />
    <p v-if="error" class="error-text">{{ error }}</p>

    <p v-if="reopened" class="hint center">
      <Icon name="check" :size="12" /> Your saved wallpaper, exactly as you left it.
    </p>

    <section class="preview-wrap">
      <div class="phone" :style="{ aspectRatio: `${size.width} / ${size.height}` }">
        <canvas
          ref="preview"
          class="preview"
          :class="{ dragging }"
          aria-label="Wallpaper preview. Drag the code to move it."
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
        <template v-if="showGuides">
          <div class="guide guide-clock"><span>Clock and widgets</span></div>
          <div class="guide guide-notifications"><span>Notifications</span></div>
          <div class="guide guide-shortcuts"><span>Shortcuts</span></div>
        </template>
        <div
          v-if="layout"
          class="block-outline"
          :class="{ visible: dragging }"
          :style="{
            left: `${layout.x * 100}%`,
            top: `${layout.y * 100}%`,
            width: `${layout.w * 100}%`,
            height: `${layout.h * 100}%`,
          }"
        />
      </div>
      <p class="hint center"><Icon name="arrows-to-sides" :size="12" /> Drag the code to move it</p>
      <label class="row small guide-toggle">
        <input v-model="showGuides" type="checkbox" /> Show lock screen guides (approximate, not saved)
      </label>
    </section>

    <section class="card stack">
      <div class="segmented" role="tablist">
        <button type="button" role="tab" :aria-selected="source === 'design'" :class="{ active: source === 'design' }" @click="source = 'design'">
          <Icon name="star" :size="13" /> Designs
        </button>
        <button type="button" role="tab" :aria-selected="source === 'photo'" :class="{ active: source === 'photo' }" @click="source = 'photo'">
          <Icon name="image" :size="14" /> Your photo
        </button>
      </div>

      <div v-if="source === 'design'" class="swatches">
        <button
          v-for="d in DESIGNS"
          :key="d.id"
          type="button"
          class="swatch"
          :class="{ selected: design === d.id }"
          @click="design = d.id"
        >
          <img v-if="designSwatches[d.id]" :src="designSwatches[d.id]" alt="" />
          <Icon v-if="d.premium && paymentsAvailable && credits < 1" name="locked-lock" :size="11" class="lock" />
          <span class="swatch-name">{{ d.name }}</span>
        </button>
      </div>

      <template v-else>
        <label v-if="!photo" class="upload">
          <input type="file" accept="image/*" hidden @change="choosePhoto" />
          <Icon name="image" :size="26" />
          <strong>Choose a photo</strong>
          <span class="hint">It stays on your phone and is never uploaded.</span>
        </label>
        <template v-else>
          <div class="swatches">
            <button
              v-for="f in PHOTO_FILTERS"
              :key="f.id"
              type="button"
              class="swatch"
              :class="{ selected: filter === f.id }"
              @click="filter = f.id"
            >
              <img v-if="filterSwatches[f.id]" :src="filterSwatches[f.id]" alt="" />
              <span class="swatch-name">{{ f.name }}</span>
            </button>
          </div>
          <label class="btn btn-text change-photo">
            <input type="file" accept="image/*" hidden @change="choosePhoto" />
            Change photo
          </label>
        </template>
      </template>
    </section>

    <section class="card stack">
      <div class="field">
        <span class="field-label">Code style</span>
        <div class="segmented">
          <button type="button" :class="{ active: options.contrast === 'blend' }" @click="options.contrast = 'blend'">Blend in</button>
          <button type="button" :class="{ active: options.contrast === 'strong' }" @click="options.contrast = 'strong'">High contrast</button>
        </div>
        <span class="hint">
          {{
            options.contrast === "blend"
              ? "A soft frosted plate that sits quietly on your background and scans on any phone."
              : "A solid white plate for the fastest scan, even in low light."
          }}
        </span>
      </div>

      <label class="field">
        <span class="field-label">Message</span>
        <input v-model="options.message" class="input" maxlength="80" placeholder="Optional line under the headline" />
      </label>

      <label class="row toggle">
        <span class="stack tight">
          <strong class="row inline"><Icon name="calendar" :size="16" /> Month calendar</strong>
          <span class="muted small">A small calendar above your code. Refresh it each month.</span>
        </span>
        <span class="spacer" />
        <Icon v-if="paymentsAvailable && credits < 1" name="locked-lock" :size="12" class="muted" />
        <input v-model="options.calendar" type="checkbox" />
      </label>
    </section>

    <section v-if="locked" class="card stack pay-callout">
      <div class="row">
        <strong class="row inline"><Icon name="star" :size="16" /> Designer wallpaper</strong>
        <span class="spacer" />
        <span class="pill pill-gold">{{ price }} NIM</span>
      </div>
      <p class="small muted">
        One payment for this wallpaper, straight to NimFind from your wallet. Midnight, Mono and your own photos are
        always free.
      </p>
      <button
        v-if="paying === 'idle'"
        class="btn btn-gold btn-block"
        type="button"
        :disabled="!inWallet"
        @click="payForWallpaper"
      >
        Pay {{ price }} NIM in Nimiq Pay
      </button>
      <p v-else-if="paying === 'wallet'" class="small muted center">Confirm the payment in Nimiq Pay</p>
      <p v-else-if="paying === 'confirming'" class="small muted center">Waiting for the Nimiq network</p>
      <template v-else>
        <p class="small muted">The payment is not visible on the network yet. This can take a minute.</p>
        <button class="btn btn-secondary btn-block" type="button" @click="checkPaymentAgain">Check again</button>
      </template>
      <p v-if="!inWallet" class="hint">Open NimFind inside Nimiq Pay to pay for a designer wallpaper.</p>
    </section>

    <p v-if="alreadyPaid" class="hint center">
      <Icon name="check" :size="12" /> Already paid for on this tag. Saving it again is free.
    </p>

    <button v-if="!locked" class="btn btn-primary btn-block" type="button" :disabled="saving || !tag" @click="save">
      <Icon name="arrow-to-bottom" :size="14" /> {{ saving ? "Preparing image" : "Save wallpaper" }}
    </button>

    <p v-if="credits > 0 && !locked && premiumSelected" class="hint center">
      <Icon name="check" :size="12" /> Paid. Saving this wallpaper uses it.
    </p>

    <section v-if="browserLink" class="card stack browser-save">
      <strong class="row inline"><Icon name="arrow-top-right" :size="12" /> Finish saving in your browser</strong>
      <p class="small muted">
        Nimiq Pay cannot save images to your gallery. Open this link in Chrome or Safari on this phone, and it shows your
        exact wallpaper with a Save button. The link works for 7 days.
      </p>
      <button class="btn btn-primary btn-block" type="button" @click="openInBrowser">Open in browser</button>
      <button class="btn btn-secondary btn-block" type="button" @click="copyBrowserLink">
        <Icon :name="linkCopied ? 'check' : 'copy'" :size="13" /> {{ linkCopied ? "Link copied, paste it in your browser" : "Copy link" }}
      </button>
    </section>

    <section v-if="saved" class="card stack">
      <strong>Set it as your lock screen</strong>
      <ol class="small instructions">
        <li><strong>iPhone:</strong> open the image in Photos, tap Share, choose Use as Wallpaper, then pick Lock Screen.</li>
        <li><strong>Android:</strong> open the image in Photos or Gallery, tap the menu, choose Use as or Set as wallpaper, then pick Lock screen.</li>
        <li>Scan your lock screen once with another phone to check it works.</li>
      </ol>
      <p class="hint">{{ inWallet ? "You can also try pressing and holding the image below." : "If the image did not save, press and hold it below and choose Save." }}</p>
      <img :src="saved.url" alt="Your NimFind wallpaper" class="saved-image" />
    </section>
  </main>
</template>

<style scoped>
.preview-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.phone {
  position: relative;
  width: min(66vw, 260px);
  border-radius: 30px;
  overflow: hidden;
  box-shadow:
    0 0 0 6px #11132a,
    0 18px 40px rgba(31, 35, 72, 0.3);
  background: #11132a;
}

.preview {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

.preview.dragging {
  cursor: grabbing;
}

.guide {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed rgba(255, 255, 255, 0.4);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  pointer-events: none;
}

.guide span {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
  background: rgba(17, 19, 42, 0.5);
  padding: 2px 6px;
  border-radius: 999px;
}

.guide-clock {
  top: 7%;
  height: 24%;
}

.guide-notifications {
  top: 68%;
  height: 20%;
}

.guide-shortcuts {
  top: 89%;
  height: 8%;
}

.block-outline {
  position: absolute;
  border: 1.5px dashed rgba(255, 255, 255, 0.85);
  border-radius: 8px;
  margin: -4px;
  padding: 4px;
  box-sizing: content-box;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
}

.block-outline.visible {
  opacity: 1;
}

.center {
  text-align: center;
  display: flex;
  align-items: center;
  gap: 6px;
}

.guide-toggle {
  gap: 8px;
  color: var(--nq-darkblue-60);
}

.segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 4px;
  gap: 4px;
  border-radius: 999px;
  background: var(--nq-darkblue-5);
}

.segmented button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-weight: 800;
  font-size: 14px;
  color: var(--nq-darkblue-60);
  cursor: pointer;
}

.segmented button.active {
  background: #fff;
  color: var(--nq-darkblue);
  box-shadow: 0 1px 4px rgba(31, 35, 72, 0.12);
}

.swatches {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 6px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}

.swatches::-webkit-scrollbar {
  display: none;
}

.swatch {
  position: relative;
  flex: 0 0 66px;
  aspect-ratio: 9 / 19.5;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  scroll-snap-align: start;
  background: var(--nq-darkblue-5);
}

.swatch img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.swatch.selected {
  border-color: var(--nq-light-blue);
  box-shadow: 0 0 0 2px rgba(12, 166, 254, 0.25);
}

.swatch-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 4px 6px;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(transparent, rgba(10, 12, 30, 0.7));
}

.lock {
  position: absolute;
  top: 6px;
  right: 6px;
  color: #fff;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4));
}

.upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 16px;
  border: 1.5px dashed var(--nq-darkblue-10);
  border-radius: 14px;
  text-align: center;
  cursor: pointer;
  color: var(--nq-darkblue);
}

.change-photo {
  align-self: flex-start;
  cursor: pointer;
}

.toggle {
  gap: 10px;
  cursor: pointer;
}

.toggle input,
.guide-toggle input {
  width: 20px;
  height: 20px;
  accent-color: var(--nq-blue);
}

.inline {
  gap: 6px;
}

.tight {
  gap: 2px;
}

.browser-save {
  box-shadow:
    inset 0 3px 0 var(--nq-light-blue),
    var(--shadow-card);
}

.pay-callout {
  background: linear-gradient(135deg, rgba(233, 178, 19, 0.14), rgba(236, 153, 28, 0.08)), #fff;
}

.instructions {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  line-height: 1.45;
}

.saved-image {
  width: 60%;
  align-self: center;
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
</style>
