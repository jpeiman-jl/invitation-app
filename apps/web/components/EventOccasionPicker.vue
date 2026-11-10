<script setup lang="ts">
import { DEFAULT_TEMPLATES, type DefaultTemplateKey } from "@invitehub/shared";

const props = defineProps<{
  modelValue: DefaultTemplateKey[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: DefaultTemplateKey[]];
}>();

function toggleOccasion(key: DefaultTemplateKey): void {
  const isSelected = props.modelValue.includes(key);
  if (isSelected && props.modelValue.length === 1) return;
  const occasions = isSelected
    ? props.modelValue.filter((occasion) => occasion !== key)
    : [...props.modelValue, key];
  emit("update:modelValue", occasions);
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <label
      v-for="occasion in DEFAULT_TEMPLATES"
      :key="occasion.key"
      class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition"
      :class="modelValue.includes(occasion.key) ? 'border-moss bg-[#f2f6f1] text-moss' : 'border-line bg-white text-ink/70 hover:border-moss/50'"
    >
      <input
        type="checkbox"
        :checked="modelValue.includes(occasion.key)"
        :disabled="modelValue.length === 1 && modelValue.includes(occasion.key)"
        class="accent-moss"
        @change="toggleOccasion(occasion.key)"
      >
      {{ occasion.category }}
    </label>
  </div>
</template>
