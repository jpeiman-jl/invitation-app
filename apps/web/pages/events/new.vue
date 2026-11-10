<script setup lang="ts">
import type { DefaultTemplateKey } from "@invitehub/shared";
import { useAuthStore } from "~/stores/auth";

useSeoMeta({ title: "Create an event" });
const auth = useAuthStore();
const { $api } = useNuxtApp();
const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const form = reactive({
  title: "",
  hostNames: "",
  startsAt: "",
  timeZone: localTimeZone,
  venue: "",
  address: "",
  mapUrl: "",
  description: "",
  dressCode: "",
  rsvpDeadline: "",
  coverImageUrl: "",
  occasionTypes: ["wedding"] as DefaultTemplateKey[],
  templateKey: "wedding" as DefaultTemplateKey
});
const submitting = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
    }
  } catch {
    errorMessage.value = "We couldn't verify your session. Please try signing in again.";
  }
});

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function submit(): Promise<void> {
  errorMessage.value = "";
  submitting.value = true;
  try {
    const event = await $api<{ event: { id: string } }>("/api/v1/events", {
      method: "POST",
      body: {
        title: form.title,
        hostNames: form.hostNames.split(",").map((name) => name.trim()).filter(Boolean),
        startsAt: new Date(form.startsAt).toISOString(),
        timeZone: form.timeZone,
        occasionTypes: form.occasionTypes,
        venue: optionalValue(form.venue),
        address: optionalValue(form.address),
        mapUrl: optionalValue(form.mapUrl),
        description: optionalValue(form.description),
        dressCode: optionalValue(form.dressCode),
        rsvpDeadline: form.rsvpDeadline ? new Date(form.rsvpDeadline).toISOString() : null,
        coverImageUrl: optionalValue(form.coverImageUrl),
        templateKey: form.templateKey
      }
    });
    await navigateTo(`/events/${event.event.id}`);
  } catch (error) {
    errorMessage.value = errorMessageFromApi(error);
  } finally {
    submitting.value = false;
  }
}

function errorMessageFromApi(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error &&
      typeof error.data === "object" && error.data !== null && "error" in error.data &&
      typeof error.data.error === "string") {
    return error.data.error;
  }
  return "Your event couldn't be saved. Check the details and try again.";
}
</script>

<template>
  <section class="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
    <NuxtLink to="/dashboard" class="text-sm font-medium text-moss hover:underline">← Back to events</NuxtLink>
    <div class="mt-5">
      <p class="text-sm font-semibold text-moss">Start with the details</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Create an event</h1>
      <p class="mt-2 text-ink/60">You can update the details and guest list any time.</p>
    </div>

    <form class="mt-8 space-y-8" @submit.prevent="submit">
      <section class="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="event-details-heading">
        <h2 id="event-details-heading" class="text-lg font-semibold">The essentials</h2>
        <div class="mt-5 grid gap-5 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="title" class="mb-2 block text-sm font-medium">Event title <span aria-hidden="true">*</span></label>
            <input id="title" v-model="form.title" required maxlength="200" placeholder="Avery & Jordan's wedding" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div class="sm:col-span-2">
            <label for="hosts" class="mb-2 block text-sm font-medium">Host names <span class="font-normal text-ink/50">(separate with commas)</span></label>
            <input id="hosts" v-model="form.hostNames" maxlength="1600" placeholder="Avery, Jordan" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div>
            <label for="startsAt" class="mb-2 block text-sm font-medium">Date and time <span aria-hidden="true">*</span></label>
            <input id="startsAt" v-model="form.startsAt" type="datetime-local" required class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div>
            <label for="timeZone" class="mb-2 block text-sm font-medium">Time zone <span aria-hidden="true">*</span></label>
            <input id="timeZone" v-model="form.timeZone" required maxlength="64" class="min-h-12 w-full rounded-xl border border-line px-4">
            <p class="mt-1 text-xs text-ink/50">Use an IANA zone, such as {{ localTimeZone }}.</p>
          </div>
          <div>
            <label for="venue" class="mb-2 block text-sm font-medium">Venue</label>
            <input id="venue" v-model="form.venue" maxlength="200" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div>
            <label for="address" class="mb-2 block text-sm font-medium">Address</label>
            <input id="address" v-model="form.address" maxlength="500" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div class="sm:col-span-2">
            <label for="mapUrl" class="mb-2 block text-sm font-medium">Map link</label>
            <input id="mapUrl" v-model="form.mapUrl" type="url" maxlength="2048" placeholder="https://" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
        </div>
      </section>

      <section class="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="event-occasion-heading">
        <h2 id="event-occasion-heading" class="text-lg font-semibold">What are you celebrating?</h2>
        <p class="mt-1 text-sm text-ink/60">Choose every occasion that applies. You can combine celebrations, such as a birthday and christening.</p>
        <div class="mt-4">
          <EventOccasionPicker v-model="form.occasionTypes" />
        </div>
      </section>

      <section class="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="invitation-style-heading">
        <h2 id="invitation-style-heading" class="text-lg font-semibold">Choose an invitation style</h2>
        <p class="mt-1 text-sm text-ink/60">You can change the design later.</p>
        <p class="mt-1 text-sm text-ink/60">Select one design for your invitation. Each card shows a sample of the finished style.</p>
        <div class="mt-5">
          <InvitationDesignPicker v-model="form.templateKey" />
        </div>
      </section>

      <section class="rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="more-details-heading">
        <h2 id="more-details-heading" class="text-lg font-semibold">A few more details</h2>
        <div class="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label for="rsvpDeadline" class="mb-2 block text-sm font-medium">RSVP deadline</label>
            <input id="rsvpDeadline" v-model="form.rsvpDeadline" type="datetime-local" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div>
            <label for="dressCode" class="mb-2 block text-sm font-medium">Dress code</label>
            <input id="dressCode" v-model="form.dressCode" maxlength="200" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div class="sm:col-span-2">
            <label for="coverImageUrl" class="mb-2 block text-sm font-medium">Cover image URL</label>
            <input id="coverImageUrl" v-model="form.coverImageUrl" type="url" maxlength="2048" placeholder="https://" class="min-h-12 w-full rounded-xl border border-line px-4">
          </div>
          <div class="sm:col-span-2">
            <label for="description" class="mb-2 block text-sm font-medium">A note for your guests</label>
            <textarea id="description" v-model="form.description" rows="4" maxlength="10000" class="w-full rounded-xl border border-line px-4 py-3" />
          </div>
        </div>
      </section>

      <p v-if="errorMessage" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ errorMessage }}</p>
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <NuxtLink to="/dashboard" class="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-white px-6 font-medium">Cancel</NuxtLink>
        <button type="submit" class="min-h-12 rounded-full bg-moss px-7 font-semibold text-white hover:bg-moss-dark disabled:opacity-60" :disabled="submitting">
          {{ submitting ? "Creating…" : "Create event" }}
        </button>
      </div>
    </form>
  </section>
</template>
