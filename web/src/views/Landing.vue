<script setup lang="ts">
import { onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import LockScreenPreview from "../components/LockScreenPreview.vue";
import LogoMark from "../components/LogoMark.vue";
import { api } from "../lib/api";
import { formatNim } from "../lib/format";

const openInNimiqPay = `https://nimpay.app/miniapps/open/${location.host}`;
// The sample lock screen's code opens this page, so scanning it from a screen is harmless.
const siteUrl = `${location.origin}/`;
const stats = ref<{ activeTags: number; itemsReturned: number; rewardsPaidNim: number } | null>(null);

onMounted(() => {
  api
    .stats()
    .then((s) => (stats.value = s))
    .catch(() => undefined);
});
</script>

<template>
  <div class="landing">
    <header class="nav">
      <a href="/" class="brand"><LogoMark :size="32" /> <span>NimFind</span></a>
      <a :href="openInNimiqPay" class="btn btn-primary nav-cta">Open in Nimiq Pay</a>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Lost and found for Nimiq Pay</span>
        <h1>If someone finds your phone, they can reach you.</h1>
        <p class="lead">
          NimFind puts a private QR code on your lock screen, keys and bags. Whoever finds them sends you a message
          without seeing your number, and you thank them in NIM once it is back.
        </p>
        <div class="hero-actions">
          <a :href="openInNimiqPay" class="btn btn-primary">Make your first tag</a>
          <a href="#how" class="btn btn-secondary">How it works</a>
        </div>
        <p class="fine">Free to use. The reward stays in your wallet until you choose to pay it.</p>
      </div>
      <div class="hero-visual">
        <div class="device-wrap">
          <LockScreenPreview :qr-text="siteUrl" />
        </div>
      </div>
    </section>

    <section v-if="stats && (stats.activeTags > 0 || stats.itemsReturned > 0)" class="stats">
      <div>
        <strong>{{ stats.activeTags }}</strong><span>tags protecting things</span>
      </div>
      <div>
        <strong>{{ stats.itemsReturned }}</strong><span>items back with their owners</span>
      </div>
      <div>
        <strong>{{ formatNim(stats.rewardsPaidNim) }}</strong><span>paid to honest finders</span>
      </div>
    </section>

    <section id="how" class="section">
      <span class="eyebrow">How it works</span>
      <h2>Three steps, and nobody shares a phone number.</h2>
      <ol class="steps">
        <li>
          <span class="step-number">1</span>
          <h3>Tag what you carry</h3>
          <p>Create a tag in Nimiq Pay. Save it as a lock screen wallpaper, or print it for keys, bags and wallets.</p>
        </li>
        <li>
          <span class="step-number">2</span>
          <h3>A finder scans it</h3>
          <p>Any phone camera opens a private page. They message you and add a wallet for the reward. No app needed.</p>
        </li>
        <li>
          <span class="step-number">3</span>
          <h3>Get it back, say thanks</h3>
          <p>Reply from Nimiq Pay, on your phone or one you borrow. Once it is back, pay the reward in one tap.</p>
        </li>
      </ol>
    </section>

    <section class="section">
      <span class="eyebrow">Built to be trusted</span>
      <h2>Private for you, simple for the finder.</h2>
      <div class="trust">
        <div class="trust-item">
          <span class="trust-icon"><Icon name="locked-lock" :size="16" /></span>
          <div>
            <h3>No numbers, no addresses</h3>
            <p>Finders never see your phone number or your wallet address. You talk through a private chat.</p>
          </div>
        </div>
        <div class="trust-item">
          <span class="trust-icon"><Icon name="coins" :size="18" /></span>
          <div>
            <h3>Your money stays yours</h3>
            <p>NimFind never holds funds. You pay the finder directly from your own wallet, only when the item is back.</p>
          </div>
        </div>
        <div class="trust-item">
          <span class="trust-icon"><Icon name="image" :size="18" /></span>
          <div>
            <h3>Photos stay on your phone</h3>
            <p>Wallpapers are drawn on your device. Personal photos are never uploaded.</p>
          </div>
        </div>
        <div class="trust-item">
          <span class="trust-icon"><Icon name="qr" :size="17" /></span>
          <div>
            <h3>Codes that scan</h3>
            <p>Every design is checked to read at camera distance, with a high contrast option for older phones.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="cta">
      <LogoMark :size="48" class="cta-mark" />
      <h2>Tag your phone in two minutes.</h2>
      <p>Open NimFind inside Nimiq Pay, create a tag, and set your new lock screen.</p>
      <a :href="openInNimiqPay" class="btn btn-gold">Open in Nimiq Pay</a>
      <p class="stores">
        No Nimiq Pay yet?
        <a href="https://apps.apple.com/app/id6471844738" target="_blank" rel="noopener">App Store</a>
        or
        <a href="https://play.google.com/store/apps/details?id=com.nimiq.pay" target="_blank" rel="noopener">Google Play</a>
      </p>
    </section>

    <footer class="footer">
      <span class="brand small-brand"><LogoMark :size="22" /> NimFind</span>
      <span>A Mini App for Nimiq Pay. Open source, MIT licensed.</span>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  --gutter: clamp(20px, 5vw, 48px);
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 var(--gutter);
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 0;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 800;
  color: var(--nq-darkblue);
  letter-spacing: -0.01em;
}

.nav-cta {
  min-height: 40px;
  padding: 0 18px;
  font-size: 14px;
}

.eyebrow {
  display: inline-block;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--nq-blue);
}

.hero {
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  align-items: center;
  padding: 24px 0 56px;
}

.hero h1 {
  margin-top: 14px;
  font-size: clamp(34px, 6.2vw, 58px);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--nq-darkblue);
}

.lead {
  margin-top: 18px;
  max-width: 520px;
  font-size: clamp(16px, 2vw, 19px);
  line-height: 1.55;
  color: var(--nq-darkblue-60);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.fine {
  margin-top: 16px;
  font-size: 13px;
  color: var(--nq-darkblue-60);
}

.hero-visual {
  display: flex;
  justify-content: center;
  position: relative;
}

/* A quiet backdrop behind the device: Nimiq blue and gold, kept soft so the screen leads. */
.hero-visual::before {
  content: "";
  position: absolute;
  inset: 8% 4% 0;
  border-radius: 40px;
  background:
    radial-gradient(60% 50% at 70% 25%, rgba(12, 166, 254, 0.16), transparent 70%),
    radial-gradient(50% 45% at 25% 80%, rgba(233, 178, 19, 0.16), transparent 70%);
}

.device-wrap {
  position: relative;
  width: min(300px, 74vw);
  padding: 8px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 22px;
  border-radius: 20px;
  background: #fff;
  box-shadow: var(--shadow-card);
}

.stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.stats strong {
  font-size: clamp(20px, 3vw, 28px);
  color: var(--nq-darkblue);
}

.stats span {
  font-size: 13px;
  color: var(--nq-darkblue-60);
}

.section {
  padding: 64px 0 8px;
}

.section h2,
.cta h2 {
  margin-top: 10px;
  max-width: 640px;
  font-size: clamp(26px, 4vw, 38px);
  line-height: 1.12;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--nq-darkblue);
}

.steps {
  list-style: none;
  margin: 32px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.steps li {
  padding: 24px;
  border-radius: 20px;
  background: #fff;
  box-shadow: var(--shadow-card);
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 14px;
  color: #fff;
  background: var(--gradient-blue);
}

h3 {
  margin: 14px 0 6px;
  font-size: 18px;
  font-weight: 800;
  color: var(--nq-darkblue);
}

.steps p,
.trust p {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--nq-darkblue-60);
}

.trust {
  margin-top: 32px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 28px 40px;
}

.trust-item {
  display: flex;
  gap: 16px;
}

.trust-item h3 {
  margin-top: 4px;
}

.trust-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nq-darkblue);
  background: rgba(31, 35, 72, 0.06);
}

.cta {
  margin: 72px 0 0;
  padding: 48px var(--gutter);
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: #fff;
  background:
    radial-gradient(70% 90% at 90% 0%, rgba(12, 166, 254, 0.22), transparent 60%),
    radial-gradient(60% 80% at 0% 100%, rgba(233, 178, 19, 0.14), transparent 60%),
    var(--nq-darkblue);
}

.cta .cta-mark {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.cta h2 {
  color: #fff;
  margin-top: 20px;
}

.cta > p {
  margin-top: 10px;
  max-width: 440px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.cta .btn {
  margin-top: 24px;
}

.cta .stores {
  margin-top: 14px;
  font-size: 13px;
}

.cta .stores a {
  color: #fff;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 32px 0 40px;
  font-size: 13px;
  color: var(--nq-darkblue-60);
}

.small-brand {
  font-size: 15px;
  gap: 8px;
}

@media (min-width: 720px) {
  .steps {
    grid-template-columns: repeat(3, 1fr);
  }

  .trust {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .hero {
    grid-template-columns: 1.1fr 0.9fr;
    padding: 48px 0 80px;
  }

  .device-wrap {
    width: 320px;
  }
}

@media (max-width: 420px) {
  .nav-cta {
    display: none;
  }

  .stats {
    padding: 18px 12px;
  }
}
</style>
