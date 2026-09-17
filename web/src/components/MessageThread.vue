<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { Message } from "../lib/api";
import { relativeTime } from "../lib/format";
import Icon from "./Icon.vue";

const props = defineProps<{ messages: Message[]; me: "owner" | "finder"; sending?: boolean; placeholder?: string }>();
const emit = defineEmits<{ send: [body: string] }>();

const draft = ref("");
const list = ref<HTMLElement | null>(null);

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    list.value?.lastElementChild?.scrollIntoView({ block: "nearest" });
  },
);

function submit() {
  const body = draft.value.trim();
  if (!body || props.sending) return;
  emit("send", body);
  draft.value = "";
}

function authorLabel(message: Message) {
  if (message.sender === props.me) return "You";
  return message.sender === "owner" ? "Owner" : "Finder";
}
</script>

<template>
  <section class="thread">
    <div ref="list" class="messages">
      <div v-for="message in messages" :key="message.id" class="bubble-row" :class="{ mine: message.sender === me }">
        <div class="bubble">
          <p class="body">{{ message.body }}</p>
          <p class="meta">{{ authorLabel(message) }} · {{ relativeTime(message.createdAt) }}</p>
        </div>
      </div>
    </div>

    <form class="composer" @submit.prevent="submit">
      <textarea
        v-model="draft"
        class="textarea composer-input"
        rows="2"
        maxlength="1000"
        :placeholder="placeholder ?? 'Write a message'"
        @keydown.enter.exact.prevent="submit"
      />
      <button class="send" type="submit" :disabled="!draft.trim() || sending" aria-label="Send message">
        <Icon name="chevron-right" :size="14" />
      </button>
    </form>
  </section>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bubble-row {
  display: flex;
}

.bubble-row.mine {
  justify-content: flex-end;
}

.bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 18px 18px 18px 6px;
  background: #fff;
  box-shadow: var(--shadow-card);
}

.mine .bubble {
  border-radius: 18px 18px 6px 18px;
  background: var(--gradient-blue);
  color: #fff;
}

.body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.45;
}

.meta {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.6;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.composer-input {
  min-height: 52px;
  resize: none;
}

.send {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: var(--gradient-blue);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.send:disabled {
  cursor: default;
  color: var(--nq-darkblue-40);
  background: rgba(31, 35, 72, 0.07);
}
</style>
