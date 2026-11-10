<script setup lang="ts">
import type { DefaultTemplateKey } from "@invitehub/shared";
import { useAuthStore } from "~/stores/auth";
import { apiErrorMessage } from "~/utils/api-error";
import { fromZonedDateTimeInput, toZonedDateTimeInput } from "~/utils/zoned-date";

interface EventForEdit {
  id: string;
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
  rsvpDeadline: string | null;
  coverImageUrl: string | null;
  templateKey: DefaultTemplateKey;
}

const route = useRoute();
const eventId = computed(() => String(route.params.eventId));
const auth = useAuthStore();
const { $api } = useNuxtApp();
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const form = reactive({
  title: "",
  hostNames: "",
  startsAt: "",
  timeZone: "UTC",
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

useSeoMeta({ title: "Edit event" });

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
      return;
    }
    const result = await $api<{ event: EventForEdit }>(`/api/v1/events/${eventId.value}`);
    Object.assign(form, {
      title: result.event.title,
      hostNames: result.event.hostNames.join(", "),
      startsAt: toZonedDateTimeInput(result.event.startsAt, result.event.timeZone),
      timeZone: result.event.timeZone,
      occasionTypes: result.event.occasionTypes,
      venue: result.event.venue ?? "",
      address: result.event.address ?? "",
      mapUrl: result.event.mapUrl ?? "",
      description: result.event.description ?? "",
      dressCode: result.event.dressCode ?? "",
      rsvpDeadline: result.event.rsvpDeadline
        ? toZonedDateTimeInput(result.event.rsvpDeadline, result.event.timeZone)
        : "",
      coverImageUrl: result.event.coverImageUrl ?? "",
      templateKey: result.event.templateKey
    });
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "This event couldn't be loaded.");
  } finally {
    loading.value = false;
  }
});

function nullable(value: string): string | null {
  return value.trim() || null;
}

async function submit(): Promise<void> {
  errorMessage.value = "";
  saving.value = true;
  try {
    await $api(`/api/v1/events/${eventId.value}`, {
      method: "PATCH",
      body: {
        title: form.title,
        hostNames: form.hostNames.split(",").map((name) => name.trim()).filter(Boolean),
        startsAt: fromZonedDateTimeInput(form.startsAt, form.timeZone),
        timeZone: form.timeZone,
        occasionTypes: form.occasionTypes,
        venue: nullable(form.venue),
        address: nullable(form.address),
        mapUrl: nullable(form.mapUrl),
        description: nullable(form.description),
        dressCode: nullable(form.dressCode),
        rsvpDeadline: form.rsvpDeadline ? fromZonedDateTimeInput(form.rsvpDeadline, form.timeZone) : null,
        coverImageUrl: nullable(form.coverImageUrl),
        templateKey: form.templateKey
      }
    });
    await navigateTo(`/events/${eventId.value}`);
  } catch (error) {
    errorMessage.value = apiErrorMessage(error, "The event couldn't be updated.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
    <NuxtLink :to="`/events/${eventId}`" class="text-sm font-medium text-moss hover:underline">← Event overview</NuxtLink>
    <p v-if="loading" class="mt-8 text-sm text-ink/60" role="status">Loading event details…</p>
    <template v-else>
      <div class="mt-5">
        <p class="text-sm font-semibold text-moss">Keep the details up to date</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight">Edit event</h1>
      </div>
      <form class="mt-7 space-y-6" @submit.prevent="submit">
        <section class="grid gap-5 rounded-3xl border border-line bg-white p-6 sm:grid-cols-2 sm:p-8" aria-label="Event details">
          <label class="text-sm font-medium sm:col-span-2">
            Event title
            <input v-model="form.title" required maxlength="200" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium sm:col-span-2">
            Host names <span class="font-normal text-ink/50">(separate with commas)</span>
            <input v-model="form.hostNames" maxlength="1600" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium">
            Date and time
            <input v-model="form.startsAt" type="datetime-local" required class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium">
            IANA time zone
            <input v-model="form.timeZone" required maxlength="64" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium">
            Venue
            <input v-model="form.venue" maxlength="200" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium">
            Address
            <input v-model="form.address" maxlength="500" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium sm:col-span-2">
            Map link
            <input v-model="form.mapUrl" type="url" maxlength="2048" placeholder="https://" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium">
            RSVP deadline
            <input v-model="form.rsvpDeadline" type="datetime-local" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium">
            Dress code
            <input v-model="form.dressCode" maxlength="200" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium sm:col-span-2">
            Cover image URL
            <input v-model="form.coverImageUrl" type="url" maxlength="2048" placeholder="https://" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
          </label>
          <label class="text-sm font-medium sm:col-span-2">
            Description
            <textarea v-model="form.description" rows="4" maxlength="10000" class="mt-2 w-full rounded-xl border border-line px-3 py-2" />
          </label>
        </section>

        <section class="rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="occasion-heading">
          <h2 id="occasion-heading" class="text-lg font-semibold">Event occasions</h2>
          <p class="mt-1 text-sm text-ink/60">Select all that apply, including combined celebrations.</p>
          <div class="mt-4">
            <EventOccasionPicker v-model="form.occasionTypes" />
          </div>
        </section>

        <section class="rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="template-heading">
          <h2 id="template-heading" class="text-lg font-semibold">Invitation style</h2>
          <p class="mt-1 text-sm text-ink/60">Choose a design independently from your event occasions.</p>
          <div class="mt-4">
            <InvitationDesignPicker v-model="form.templateKey" />
          </div>
        </section>

        <p v-if="errorMessage" class="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ errorMessage }}</p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <NuxtLink :to="`/events/${eventId}`" class="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-white px-6 font-medium">Cancel</NuxtLink>
          <button type="submit" class="min-h-12 rounded-full bg-moss px-7 font-semibold text-white hover:bg-moss-dark disabled:opacity-60" :disabled="saving">
            {{ saving ? "Saving…" : "Save event" }}
          </button>
        </div>
      </form>
    </template>
  </section>
</template>
