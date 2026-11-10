<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

interface DashboardEvent {
  id: string;
  title: string;
  startsAt: string;
  timeZone: string;
  venue: string | null;
  _count: { guests: number; tables: number };
}

useSeoMeta({ title: "Your events" });
const auth = useAuthStore();
const { $api } = useNuxtApp();
const events = ref<DashboardEvent[]>([]);
const loading = ref(true);
const errorMessage = ref("");

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
      return;
    }
    events.value = await $api<DashboardEvent[]>("/api/v1/events");
  } catch {
    errorMessage.value = "Your events could not be loaded. Please refresh and try again.";
  } finally {
    loading.value = false;
  }
});

function formatEventDate(event: DashboardEvent): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: event.timeZone
  }).format(new Date(event.startsAt));
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold text-moss">Your gathering place</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your events</h1>
        <p class="mt-2 text-ink/60">A little home for every good day you're planning.</p>
      </div>
      <NuxtLink to="/events/new" class="inline-flex min-h-12 items-center justify-center rounded-full bg-moss px-5 font-semibold text-white hover:bg-moss-dark">
        <span aria-hidden="true" class="mr-2 text-lg">+</span> Create event
      </NuxtLink>
    </div>

    <p v-if="loading" class="mt-10 text-sm text-ink/60" role="status">Loading your events…</p>
    <p v-else-if="errorMessage" class="mt-10 rounded-2xl bg-red-50 p-5 text-sm text-red-800" role="alert">{{ errorMessage }}</p>
    <div v-else-if="events.length" class="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="event in events" :key="event.id" class="flex min-h-64 flex-col rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8eee8] text-xl text-moss" aria-hidden="true">✦</div>
          <span class="rounded-full bg-paper px-3 py-1 text-xs font-medium text-ink/60">
            {{ event._count.guests }} {{ event._count.guests === 1 ? "guest" : "guests" }}
          </span>
        </div>
        <h2 class="mt-5 text-xl font-semibold">{{ event.title }}</h2>
        <p class="mt-2 text-sm text-ink/60">{{ formatEventDate(event) }}</p>
        <p v-if="event.venue" class="mt-1 text-sm text-ink/60">{{ event.venue }}</p>
        <div class="mt-auto flex flex-wrap gap-3 pt-6">
          <NuxtLink :to="`/events/${event.id}`" class="inline-flex min-h-10 items-center rounded-full bg-moss px-4 text-sm font-medium text-white hover:bg-moss-dark">
            Event overview
          </NuxtLink>
          <NuxtLink :to="`/events/${event.id}/guests`" class="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-medium hover:bg-paper">
            Guest list
          </NuxtLink>
        </div>
      </article>
    </div>
    <div v-else-if="!loading" class="mt-10 rounded-3xl border border-dashed border-[#c8d2c8] bg-white/70 px-6 py-14 text-center">
      <span class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e8eee8] text-2xl text-moss" aria-hidden="true">✦</span>
      <h2 class="mt-5 text-xl font-semibold">Your first event starts here</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/60">Create your event, add a few guests, and share an invitation link. Guests can RSVP without creating an account.</p>
      <NuxtLink to="/events/new" class="mt-6 inline-flex min-h-11 items-center rounded-full bg-moss px-5 font-semibold text-white hover:bg-moss-dark">
        Create your first event
      </NuxtLink>
    </div>
  </section>
</template>
