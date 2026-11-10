<script setup lang="ts">
import {
  DEFAULT_TEMPLATES,
  type DefaultTemplate,
  type DefaultTemplateKey,
  type EventProgramItem
} from "@invitehub/shared";

interface InvitationEvent {
  title: string;
  hostNames: string[];
  startsAt: string;
  timeZone: string;
  occasionTypes: DefaultTemplateKey[];
  venue: string | null;
  address: string | null;
  mapUrl: string | null;
  description: string | null;
  dressCode: string | null;
  coverImageUrl: string | null;
  templateKey: string;
  programItems: EventProgramItem[];
}

const props = defineProps<{
  event: InvitationEvent;
  guestName: string;
}>();

const theme = computed<DefaultTemplate>(() =>
  DEFAULT_TEMPLATES.find((template) => template.key === props.event.templateKey) ?? DEFAULT_TEMPLATES[0]!
);
const occasions = computed(() => props.event.occasionTypes
  .map((key) => DEFAULT_TEMPLATES.find((template) => template.key === key)?.category)
  .filter((category): category is string => Boolean(category)));
const eventDate = computed(() => new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: props.event.timeZone
}).format(new Date(props.event.startsAt)));
const eventTime = computed(() => new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: props.event.timeZone
}).format(new Date(props.event.startsAt)));
</script>

<template>
  <article
    class="overflow-hidden rounded-[2rem] border border-black/5 shadow-soft"
    :style="{
      backgroundColor: theme.surface,
      color: theme.ink
    }"
    aria-labelledby="invitation-title"
  >
    <div v-if="event.coverImageUrl" class="h-52 overflow-hidden sm:h-72">
      <img :src="event.coverImageUrl" :alt="`Cover image for ${event.title}`" class="h-full w-full object-cover">
    </div>
    <div class="p-7 text-center sm:p-12" :style="{ backgroundColor: theme.background }">
      <div class="mx-auto mb-7 h-1 w-16 rounded-full opacity-30" :style="{ backgroundColor: theme.accent }" aria-hidden="true" />
      <p class="text-xs font-medium uppercase tracking-[0.24em]" :style="{ color: theme.muted }">{{ theme.eyebrow }}</p>
      <p v-if="event.hostNames.length" class="mt-4 text-sm" :style="{ color: theme.muted }">
        {{ event.hostNames.join(" · ") }}
      </p>
      <ul v-if="occasions.length" class="mt-4 flex flex-wrap justify-center gap-2" aria-label="Event occasions">
        <li
          v-for="occasion in occasions"
          :key="occasion"
          class="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          :style="{ borderColor: `${theme.accent}55`, color: theme.accent }"
        >{{ occasion }}</li>
      </ul>
      <h1 id="invitation-title" class="mx-auto mt-4 max-w-2xl text-4xl font-medium leading-tight sm:text-5xl" :style="{ fontFamily: theme.displayFont }">
        {{ event.title }}
      </h1>
      <p class="mt-5 text-base font-medium">{{ eventDate }}</p>
      <p class="mt-1 text-sm" :style="{ color: theme.muted }">{{ eventTime }} · {{ event.timeZone }}</p>

      <div class="mx-auto my-8 h-px max-w-xs opacity-20" :style="{ backgroundColor: theme.accent }" aria-hidden="true" />
      <p class="text-sm" :style="{ color: theme.muted }">For {{ guestName }}</p>
      <p v-if="event.venue" class="mt-3 font-medium">{{ event.venue }}</p>
      <p v-if="event.address" class="mt-1 text-sm" :style="{ color: theme.muted }">{{ event.address }}</p>
      <a
        v-if="event.mapUrl"
        :href="event.mapUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3 inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium hover:bg-white/50"
        :style="{ borderColor: `${theme.accent}55`, color: theme.accent }"
      >
        View map <span class="sr-only">(opens in a new tab)</span>
      </a>
      <div v-if="event.description || event.dressCode" class="mx-auto mt-8 max-w-xl space-y-4 text-sm leading-6">
        <p v-if="event.description" class="whitespace-pre-line">{{ event.description }}</p>
        <p v-if="event.dressCode" :style="{ color: theme.muted }"><span class="font-semibold">Attire:</span> {{ event.dressCode }}</p>
      </div>
      <section v-if="event.programItems.length" class="mx-auto mt-10 max-w-xl text-left" aria-labelledby="event-program-heading">
        <div class="mx-auto mb-5 h-px max-w-xs opacity-20" :style="{ backgroundColor: theme.accent }" aria-hidden="true" />
        <h2 id="event-program-heading" class="text-center text-xl font-medium" :style="{ fontFamily: theme.displayFont }">Program</h2>
        <ol class="mt-5 space-y-4">
          <li v-for="(item, index) in event.programItems" :key="`${item.title}-${index}`" class="flex gap-4 rounded-2xl border border-black/5 bg-white/40 p-4">
            <time v-if="item.time" class="w-20 shrink-0 pt-0.5 text-sm font-semibold" :style="{ color: theme.accent }">{{ item.time }}</time>
            <span v-else class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold" :style="{ backgroundColor: `${theme.accent}18`, color: theme.accent }">{{ index + 1 }}</span>
            <span class="min-w-0">
              <span class="block font-semibold">{{ item.title }}</span>
              <span v-if="item.lead" class="mt-1 block text-sm" :style="{ color: theme.muted }">Led by {{ item.lead }}</span>
              <span v-if="item.description" class="mt-1 block whitespace-pre-line text-sm leading-6" :style="{ color: theme.muted }">{{ item.description }}</span>
            </span>
          </li>
        </ol>
      </section>
    </div>
  </article>
</template>
