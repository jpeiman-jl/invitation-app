<script setup lang="ts">
import { DEFAULT_TEMPLATES, type DefaultTemplateKey } from "@invitehub/shared";

defineProps<{
  modelValue: DefaultTemplateKey;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: DefaultTemplateKey];
}>();
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <label
      v-for="design in DEFAULT_TEMPLATES"
      :key="design.key"
      class="cursor-pointer rounded-2xl border p-3 transition focus-within:ring-2 focus-within:ring-moss focus-within:ring-offset-2"
      :class="modelValue === design.key ? 'border-moss bg-[#f2f6f1] shadow-sm' : 'border-line hover:border-moss/50 hover:bg-paper/50'"
    >
      <input
        type="radio"
        name="invitation-design"
        :value="design.key"
        :checked="modelValue === design.key"
        class="sr-only"
        @change="emit('update:modelValue', design.key)"
      >
      <span
        class="relative flex aspect-[1.65] flex-col items-center justify-center overflow-hidden rounded-xl border px-3 text-center"
        :style="{ backgroundColor: design.background, color: design.ink, borderColor: `${design.accent}40` }"
        aria-hidden="true"
      >
        <span class="absolute left-3 right-3 top-3 h-px opacity-35" :style="{ backgroundColor: design.accent }" />
        <span class="text-[8px] font-semibold uppercase tracking-[0.2em]" :style="{ color: design.muted }">{{ design.eyebrow }}</span>
        <span class="mt-2 text-lg font-medium leading-tight" :style="{ color: design.accent, fontFamily: design.displayFont }">{{ design.name }}</span>
        <span class="mt-1 text-[9px] uppercase tracking-[0.16em]" :style="{ color: design.muted }">{{ design.category }} celebration</span>
        <span class="mt-2 h-px w-9 opacity-50" :style="{ backgroundColor: design.accent }" />
        <span class="mt-1 text-[8px]" :style="{ color: design.muted }">Date · Time · Place</span>
        <span class="absolute bottom-3 left-3 right-3 h-px opacity-35" :style="{ backgroundColor: design.accent }" />
      </span>
      <span class="mt-3 flex items-center justify-between gap-2">
        <span>
          <span class="block text-xs font-semibold uppercase tracking-wide text-moss">{{ design.category }}</span>
          <span class="mt-1 block font-medium text-ink">{{ design.name }}</span>
        </span>
        <span
          class="rounded-full px-2.5 py-1 text-xs font-semibold"
          :class="modelValue === design.key ? 'bg-moss text-white' : 'bg-paper text-ink/60'"
        >{{ modelValue === design.key ? "Selected" : "Choose" }}</span>
      </span>
      <span class="mt-1 block text-xs leading-5 text-ink/55">{{ design.description }}</span>
    </label>
  </div>
</template>
