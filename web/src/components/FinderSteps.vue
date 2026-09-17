<script setup lang="ts">
import Icon from "./Icon.vue";

/** Progress for finders: which of the three steps are done. */
defineProps<{ messaged: boolean; returned: boolean; paid: boolean }>();
</script>

<template>
  <ol class="steps" aria-label="Your progress">
    <li :class="{ done: messaged, current: !messaged }">
      <span class="dot"><Icon v-if="messaged" name="check" :size="10" /><template v-else>1</template></span>
      <span class="name">Message the owner</span>
    </li>
    <li :class="{ done: returned, current: messaged && !returned }">
      <span class="dot"><Icon v-if="returned" name="check" :size="10" /><template v-else>2</template></span>
      <span class="name">Return the item</span>
    </li>
    <li :class="{ done: paid, current: returned && !paid }">
      <span class="dot"><Icon v-if="paid" name="check" :size="10" /><template v-else>3</template></span>
      <span class="name">Get your reward</span>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  position: relative;
}

.steps li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  position: relative;
}

/* Connector line between steps */
.steps li:not(:first-child)::before {
  content: "";
  position: absolute;
  top: 13px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: var(--nq-darkblue-10);
  z-index: 0;
}

.steps li.done:not(:first-child)::before,
.steps li.current:not(:first-child)::before {
  background: var(--nq-green);
}

.dot {
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: var(--nq-darkblue-60);
  background: #fff;
  box-shadow: inset 0 0 0 2px var(--nq-darkblue-10);
}

.current .dot {
  color: #fff;
  background: var(--gradient-blue);
  box-shadow: 0 3px 10px rgba(5, 130, 202, 0.3);
}

.done .dot {
  color: #fff;
  background: var(--nq-green);
  box-shadow: none;
}

.name {
  font-size: 12px;
  font-weight: 700;
  color: var(--nq-darkblue-60);
}

.current .name,
.done .name {
  color: var(--nq-darkblue);
}
</style>
