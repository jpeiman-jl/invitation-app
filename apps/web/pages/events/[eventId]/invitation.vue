<script setup lang="ts">
import {
  DEFAULT_TEMPLATES,
  eventProgramItemSchema,
  type DefaultTemplateKey,
  type EventProgramItem
} from "@invitehub/shared";
import InvitationRenderer from "~/components/InvitationRenderer.vue";
import InvitationDesignPicker from "~/components/InvitationDesignPicker.vue";
import { useAuthStore } from "~/stores/auth";
import { apiErrorMessage } from "~/utils/api-error";

interface EventForPreview {
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
  coverImageUrl: string | null;
  templateKey: DefaultTemplateKey;
  programItems: EventProgramItem[];
}

interface ProgramItemDraft {
  title: string;
  time: string;
  lead: string;
  description: string;
}

const route = useRoute();
const eventId = computed(() => String(route.params.eventId));
const auth = useAuthStore();
const { $api } = useNuxtApp();
const event = ref<EventForPreview | null>(null);
const programItems = ref<ProgramItemDraft[]>([]);
const selectedTemplateKey = ref<DefaultTemplateKey>("wedding");
const draft = reactive<ProgramItemDraft>({ title: "", time: "", lead: "", description: "" });
const loading = ref(true);
const saving = ref(false);
const savingDesign = ref(false);
const pageError = ref("");
const formError = ref("");
const actionMessage = ref("");

useSeoMeta({ title: "Invitation design & program" });

const template = computed(() =>
  DEFAULT_TEMPLATES.find((item) => item.key === selectedTemplateKey.value) ?? DEFAULT_TEMPLATES[0]!
);
const previewEvent = computed(() => event.value
  ? {
      ...event.value,
      templateKey: selectedTemplateKey.value,
      programItems: programItems.value.map((item) => ({
        title: item.title,
        time: item.time || null,
        lead: item.lead || null,
        description: item.description || null
      }))
    }
  : null
);

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
      return;
    }
    const result = await $api<{ event: EventForPreview }>(`/api/v1/events/${eventId.value}`);
    event.value = result.event;
    selectedTemplateKey.value = result.event.templateKey;
    programItems.value = result.event.programItems.map((item) => ({
      title: item.title,
      time: item.time ?? "",
      lead: item.lead ?? "",
      description: item.description ?? ""
    }));
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The invitation preview couldn't be loaded.");
  } finally {
    loading.value = false;
  }
});

function addProgramItem(): void {
  formError.value = "";
  actionMessage.value = "";
  if (programItems.value.length >= 50) {
    formError.value = "An event can have up to 50 program items.";
    return;
  }
  const parsed = eventProgramItemSchema.safeParse(draft);
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? "Check the program item details.";
    return;
  }
  programItems.value.push({
    title: parsed.data.title,
    time: parsed.data.time ?? "",
    lead: parsed.data.lead ?? "",
    description: parsed.data.description ?? ""
  });
  Object.assign(draft, { title: "", time: "", lead: "", description: "" });
}

function removeProgramItem(index: number): void {
  programItems.value.splice(index, 1);
  actionMessage.value = "";
}

async function saveDesign(): Promise<void> {
  if (!event.value) return;
  pageError.value = "";
  actionMessage.value = "";
  savingDesign.value = true;
  try {
    const result = await $api<{ event: EventForPreview }>(`/api/v1/events/${eventId.value}`, {
      method: "PATCH",
      body: { templateKey: selectedTemplateKey.value }
    });
    event.value = result.event;
    selectedTemplateKey.value = result.event.templateKey;
    actionMessage.value = "Invitation design saved.";
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The invitation design couldn't be saved.");
  } finally {
    savingDesign.value = false;
  }
}

async function saveProgram(): Promise<void> {
  formError.value = "";
  pageError.value = "";
  actionMessage.value = "";
  if (programItems.value.length > 50) {
    formError.value = "An event can have up to 50 program items.";
    return;
  }
  const parsedItems = programItems.value.map((item) => eventProgramItemSchema.safeParse(item));
  const invalidItem = parsedItems.find((item) => !item.success);
  if (invalidItem && !invalidItem.success) {
    formError.value = invalidItem.error.issues[0]?.message ?? "Check the program details.";
    return;
  }

  saving.value = true;
  try {
    const result = await $api<{ event: EventForPreview }>(`/api/v1/events/${eventId.value}`, {
      method: "PATCH",
      body: { programItems: parsedItems.map((item) => item.success ? item.data : null) }
    });
    event.value = result.event;
    programItems.value = result.event.programItems.map((item) => ({
      title: item.title,
      time: item.time ?? "",
      lead: item.lead ?? "",
      description: item.description ?? ""
    }));
    actionMessage.value = "Event program saved.";
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The event program couldn't be saved.");
  } finally {
    saving.value = false;
  }
}

function printInvitation(): void {
  window.print();
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <NuxtLink :to="`/events/${eventId}`" class="text-sm font-medium text-moss hover:underline">← Event overview</NuxtLink>
    <p v-if="loading" class="mt-8 text-sm text-ink/60" role="status">Loading invitation design…</p>
    <template v-else-if="event && previewEvent">
      <div class="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-sm font-semibold text-moss">Invitation design & event program</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{{ event.title }}</h1>
          <p class="mt-2 text-sm text-ink/60">Preview the selected invitation template and build the program guests will see.</p>
        </div>
        <div class="no-print flex flex-wrap gap-2">
          <button type="button" class="min-h-11 rounded-full bg-moss px-4 text-sm font-semibold text-white hover:bg-moss-dark" @click="printInvitation">
            Print preview
          </button>
        </div>
      </div>

      <p v-if="pageError" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ pageError }}</p>
      <p v-if="actionMessage" class="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900" role="status">{{ actionMessage }}</p>

      <section class="no-print mt-7 rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="design-choices-heading">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-moss">Choose an invitation design</p>
            <h2 id="design-choices-heading" class="mt-1 text-xl font-semibold">Six ready-to-use occasion designs</h2>
            <p class="mt-1 text-sm text-ink/60">Pick a sample below, then preview and save it for your invitation.</p>
          </div>
          <button
            type="button"
            class="min-h-11 shrink-0 rounded-full bg-moss px-5 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60"
            :disabled="savingDesign || selectedTemplateKey === event.templateKey"
            @click="saveDesign"
          >{{ savingDesign ? "Saving…" : "Use this design" }}</button>
        </div>
        <div class="mt-5">
          <InvitationDesignPicker v-model="selectedTemplateKey" />
        </div>
      </section>

      <div class="mt-7 grid items-start gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <section aria-labelledby="design-preview-heading">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-moss">{{ template.category }}</p>
              <h2 id="design-preview-heading" class="mt-1 text-xl font-semibold">{{ template.name }}</h2>
            </div>
            <span class="rounded-full bg-[#edf2ed] px-3 py-1.5 text-xs font-medium text-moss">Selected template</span>
          </div>
          <InvitationRenderer :event="previewEvent" guest-name="Your guest" />
        </section>

        <section class="no-print rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="program-heading">
          <p class="text-sm font-semibold text-moss">Guest-facing itinerary</p>
          <h2 id="program-heading" class="mt-1 text-2xl font-semibold">Event program</h2>
          <p class="mt-2 text-sm leading-6 text-ink/60">Add moments such as welcome remarks, dinner, or “Prayer — led by Mrs. Garcia.” The saved program appears on the invitation.</p>

          <ol v-if="programItems.length" class="mt-6 space-y-4">
            <li v-for="(item, index) in programItems" :key="index" class="rounded-2xl border border-line bg-paper/50 p-4">
              <div class="mb-3 flex items-center justify-between">
                <span class="text-xs font-semibold uppercase tracking-wide text-moss">Program item {{ index + 1 }}</span>
                <button type="button" class="text-xs font-medium text-red-800 hover:underline" @click="removeProgramItem(index)">Remove</button>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium text-ink/65 sm:col-span-2">
                  Program name
                  <input v-model="item.title" required maxlength="120" class="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholder="Prayer">
                </label>
                <label class="text-xs font-medium text-ink/65">
                  Time <span class="font-normal">(optional)</span>
                  <input v-model="item.time" maxlength="32" class="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholder="4:30 PM">
                </label>
                <label class="text-xs font-medium text-ink/65">
                  Lead / speaker <span class="font-normal">(optional)</span>
                  <input v-model="item.lead" maxlength="160" class="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholder="Mrs. Garcia">
                </label>
                <label class="text-xs font-medium text-ink/65 sm:col-span-2">
                  Details <span class="font-normal">(optional)</span>
                  <textarea v-model="item.description" rows="2" maxlength="1000" class="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink" />
                </label>
              </div>
            </li>
          </ol>
          <p v-else class="mt-5 rounded-2xl border border-dashed border-line p-5 text-sm text-ink/55">No program items yet. Add the event schedule below.</p>

          <form class="mt-6 rounded-2xl bg-[#edf2ed] p-4" @submit.prevent="addProgramItem">
            <h3 class="font-semibold">Add a program item</h3>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="text-xs font-medium text-ink/65 sm:col-span-2">
                Program name
                <input v-model="draft.title" required maxlength="120" class="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholder="Prayer">
              </label>
              <label class="text-xs font-medium text-ink/65">
                Time
                <input v-model="draft.time" maxlength="32" class="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholder="4:30 PM">
              </label>
              <label class="text-xs font-medium text-ink/65">
                Lead / speaker
                <input v-model="draft.lead" maxlength="160" class="mt-1.5 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" placeholder="Mrs. Garcia">
              </label>
              <label class="text-xs font-medium text-ink/65 sm:col-span-2">
                Details
                <textarea v-model="draft.description" rows="2" maxlength="1000" class="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink" />
              </label>
            </div>
            <button type="submit" class="mt-3 min-h-10 rounded-full border border-moss px-4 text-sm font-semibold text-moss hover:bg-white">Add to program</button>
          </form>

          <p v-if="formError" class="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{{ formError }}</p>
          <button type="button" class="mt-5 min-h-11 w-full rounded-full bg-moss px-5 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60" :disabled="saving" @click="saveProgram">
            {{ saving ? "Saving…" : "Save event program" }}
          </button>
        </section>
      </div>
    </template>
  </section>
</template>

<style>
@media print {
  .no-print {
    display: none !important;
  }

  body,
  .min-h-screen {
    background: white !important;
  }
}
</style>
