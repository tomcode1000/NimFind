<script setup lang="ts">
import { computed } from "vue";
import { iconData, type IconName } from "../lib/icons";

const props = withDefaults(defineProps<{ name: IconName; size?: number | string }>(), { size: "1em" });

const icon = computed(() => iconData(props.name));
const dimension = computed(() => (typeof props.size === "number" ? `${props.size}px` : props.size));
</script>

<template>
  <svg
    class="icon"
    :viewBox="`0 0 ${icon.width} ${icon.height}`"
    :width="dimension"
    :height="dimension"
    aria-hidden="true"
    focusable="false"
    v-html="icon.body"
  />
</template>

<style scoped>
.icon {
  flex-shrink: 0;
  display: inline-block;
  vertical-align: middle;
}
</style>
