<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ensureFonts } from "../lib/canvas";
import { renderBackground, renderWallpaper, type DesignId } from "../lib/wallpaper";

/** A real NimFind wallpaper, drawn by the same engine owners use, inside a lock screen frame. */
const props = withDefaults(defineProps<{ design?: DesignId; qrText: string }>(), { design: "midnight" });

const canvas = ref<HTMLCanvasElement | null>(null);
const now = new Date();
const time = now.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: false });
const date = now.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });

onMounted(async () => {
  await ensureFonts();
  if (!canvas.value) return;
  const background = document.createElement("canvas");
  renderBackground(background, { kind: "design", design: props.design }, 780, 1690);
  renderWallpaper(canvas.value, background, {
    qrText: props.qrText,
    headline: "Found this phone?",
    message: "Scan to message the owner. No phone numbers shared.",
    rewardNim: 5000,
    x: 0.07,
    y: 0.4,
    contrast: "blend",
    calendar: false,
    date: now,
  });
});
</script>

<template>
  <div class="device" role="img" aria-label="A phone lock screen showing a NimFind code with a reward">
    <canvas ref="canvas" class="screen" />
    <div class="status">
      <span class="notch" />
    </div>
    <div class="clock">
      <span class="date">{{ date }}</span>
      <span class="time">{{ time }}</span>
    </div>
    <div class="shortcuts">
      <span class="shortcut" />
      <span class="shortcut" />
    </div>
  </div>
</template>

<style scoped>
.device {
  position: relative;
  width: 100%;
  aspect-ratio: 780 / 1690;
  border-radius: 13% / 6%;
  overflow: hidden;
  background: #0d0f22;
  box-shadow:
    0 0 0 8px #0d0f22,
    0 0 0 9px rgba(255, 255, 255, 0.08),
    0 40px 80px rgba(17, 19, 42, 0.35);
}

.screen {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.status {
  position: absolute;
  top: 2.2%;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
}

.notch {
  width: 30%;
  height: 0;
  padding-bottom: 8%;
  border-radius: 999px;
  background: #05060f;
}

.clock {
  position: absolute;
  top: 9%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  letter-spacing: -0.01em;
  container-type: inline-size;
}

.date {
  font-size: 5.2cqw;
  opacity: 0.85;
}

.time {
  font-size: 22cqw;
  line-height: 1;
  font-weight: 700;
}

.shortcuts {
  position: absolute;
  bottom: 4%;
  left: 9%;
  right: 9%;
  display: flex;
  justify-content: space-between;
}

.shortcut {
  width: 13%;
  aspect-ratio: 1;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(6px);
}
</style>
