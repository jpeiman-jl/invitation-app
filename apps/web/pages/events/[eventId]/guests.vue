<script setup lang="ts">
import { emailAddressSchema } from "@invitehub/shared";
import { useAuthStore } from "~/stores/auth";
import { apiErrorMessage } from "~/utils/api-error";

interface GuestResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  household: string | null;
  maxPartySize: number;
  notes: string | null;
  dietaryRestrictions: string | null;
  invitation: {
    status: string;
    sentAt: string | null;
    remindedAt: string | null;
    url: string;
  } | null;
  rsvp: { status: "ATTENDING" | "DECLINED" | "MAYBE"; partySize: number } | null;
}

async function sendReminders(): Promise<void> {
  actionMessage.value = "";
  actionError.value = "";
  reminding.value = true;
  try {
    const result = await $api<{ queued: number; failed: number; skippedNoEmail: number }>(
      `/api/v1/events/${eventId.value}/invitations/remind`,
      { method: "POST" }
    );
    actionMessage.value = `${result.queued} reminders queued, ${result.skippedNoEmail} skipped — no valid email${result.failed ? `, ${result.failed} failed` : ""}.`;
    await loadGuests();
  } catch (error) {
    actionError.value = apiErrorMessage(error, "Reminder emails couldn't be queued.");
  } finally {
    reminding.value = false;
  }
}

interface EventHeader {
  id: string;
  title: string;
}

const route = useRoute();
const eventId = computed(() => String(route.params.eventId));
const auth = useAuthStore();
const { $api } = useNuxtApp();
const event = ref<EventHeader | null>(null);
const guests = ref<GuestResponse[]>([]);
const loading = ref(true);
const adding = ref(false);
const addOpen = ref(true);
const addError = ref("");
const pageError = ref("");
const actionMessage = ref("");
const actionError = ref("");
const selectedIds = ref<string[]>([]);
const csvText = ref("");
const csvBusy = ref(false);
const reminding = ref(false);
const csvError = ref("");
const csvResult = ref("");
const copiedGuestId = ref("");
const editingId = ref<string | null>(null);
const editError = ref("");
const editSaving = ref(false);
const editForm = reactive({
  name: "",
  email: "",
  phone: "",
  household: "",
  maxPartySize: 1,
  notes: "",
  dietaryRestrictions: ""
});
const sendingIds = ref<string[]>([]);
const deletingId = ref("");

const addForm = reactive({
  name: "",
  email: "",
  phone: "",
  household: "",
  maxPartySize: 1,
  notes: "",
  dietaryRestrictions: ""
});

useSeoMeta({ title: "Guest list" });

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
      return;
    }
    await loadGuests();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The guest list couldn't be loaded.");
  } finally {
    loading.value = false;
  }
});

async function loadGuests(): Promise<void> {
  const [eventResult, guestResult] = await Promise.all([
    $api<{ event: EventHeader }>(`/api/v1/events/${eventId.value}`),
    $api<{ guests: GuestResponse[] }>(`/api/v1/events/${eventId.value}/guests`)
  ]);
  event.value = eventResult.event;
  guests.value = guestResult.guests;
  selectedIds.value = selectedIds.value.filter((id) => guests.value.some((guest) => guest.id === id));
}

function isEmailEligible(email: string | null): boolean {
  return email !== null && emailAddressSchema.safeParse(email).success;
}

async function addGuest(): Promise<void> {
  addError.value = "";
  adding.value = true;
  try {
    await $api(`/api/v1/events/${eventId.value}/guests`, {
      method: "POST",
      body: {
        ...addForm,
        email: addForm.email.trim() || null,
        phone: addForm.phone.trim() || null,
        household: addForm.household.trim() || null,
        notes: addForm.notes.trim() || null,
        dietaryRestrictions: addForm.dietaryRestrictions.trim() || null
      }
    });
    Object.assign(addForm, {
      name: "",
      email: "",
      phone: "",
      household: "",
      maxPartySize: 1,
      notes: "",
      dietaryRestrictions: ""
    });
    await loadGuests();
    actionMessage.value = "Guest added. Their shareable invitation link is ready below.";
  } catch (error) {
    addError.value = apiErrorMessage(error, "This guest couldn't be added.");
  } finally {
    adding.value = false;
  }
}

async function copyLink(guest: GuestResponse): Promise<void> {
  if (!guest.invitation?.url) {
    actionError.value = "This guest doesn't have an invitation link yet.";
    return;
  }
  try {
    await navigator.clipboard.writeText(guest.invitation.url);
    copiedGuestId.value = guest.id;
    actionMessage.value = `Invitation link copied for ${guest.name}.`;
    actionError.value = "";
    window.setTimeout(() => {
      if (copiedGuestId.value === guest.id) copiedGuestId.value = "";
    }, 1800);
  } catch {
    actionError.value = "We couldn't copy the link. Check your browser's clipboard permissions.";
  }
}

async function sendInvitations(ids: string[]): Promise<void> {
  actionMessage.value = "";
  actionError.value = "";
  sendingIds.value = ids;
  try {
    const result = await $api<{ queued: number; failed: number; skippedNoEmail: number }>(
      `/api/v1/events/${eventId.value}/invitations/send`,
      { method: "POST", body: { guestIds: ids } }
    );
    actionMessage.value = `${result.queued} queued, ${result.skippedNoEmail} skipped — no valid email${result.failed ? `, ${result.failed} failed` : ""}.`;
    await loadGuests();
  } catch (error) {
    actionError.value = apiErrorMessage(error, "The email invitations couldn't be queued.");
  } finally {
    sendingIds.value = [];
  }
}

async function importCsv(): Promise<void> {
  csvError.value = "";
  csvResult.value = "";
  csvBusy.value = true;
  try {
    const result = await $api<{ imported: number }>(`/api/v1/events/${eventId.value}/guests/import`, {
      method: "POST",
      body: { csv: csvText.value }
    });
    csvResult.value = `${result.imported} guest${result.imported === 1 ? "" : "s"} imported.`;
    csvText.value = "";
    await loadGuests();
  } catch (error) {
    csvError.value = apiErrorMessage(error, "The CSV couldn't be imported. Check the names and email addresses.");
  } finally {
    csvBusy.value = false;
  }
}

async function readCsvFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    csvError.value = "CSV file must be smaller than 2 MB.";
    input.value = "";
    return;
  }
  csvError.value = "";
  csvText.value = await file.text();
}

function beginEdit(guest: GuestResponse): void {
  editingId.value = guest.id;
  Object.assign(editForm, {
    name: guest.name,
    email: guest.email ?? "",
    phone: guest.phone ?? "",
    household: guest.household ?? "",
    maxPartySize: guest.maxPartySize,
    notes: guest.notes ?? "",
    dietaryRestrictions: guest.dietaryRestrictions ?? ""
  });
  editError.value = "";
}

async function saveEdit(guest: GuestResponse): Promise<void> {
  editError.value = "";
  editSaving.value = true;
  try {
    await $api(`/api/v1/guests/${guest.id}`, {
      method: "PATCH",
      body: {
        ...editForm,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        household: editForm.household.trim() || null
      }
    });
    editingId.value = null;
    await loadGuests();
    actionMessage.value = `${guest.name}'s details were updated.`;
  } catch (error) {
    editError.value = apiErrorMessage(error, "Guest details couldn't be updated.");
  } finally {
    editSaving.value = false;
  }
}

async function deleteGuest(guest: GuestResponse): Promise<void> {
  if (!window.confirm(`Remove ${guest.name} from this event?`)) return;
  deletingId.value = guest.id;
  actionError.value = "";
  try {
    await $api(`/api/v1/guests/${guest.id}`, { method: "DELETE" });
    await loadGuests();
    actionMessage.value = `${guest.name} was removed from the guest list.`;
  } catch (error) {
    actionError.value = apiErrorMessage(error, "This guest couldn't be removed.");
  } finally {
    deletingId.value = "";
  }
}

function toggleGuest(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((selectedId) => selectedId !== id)
    : [...selectedIds.value, id];
}

function toggleAll(): void {
  selectedIds.value = selectedIds.value.length === guests.value.length
    ? []
    : guests.value.map((guest) => guest.id);
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <NuxtLink :to="`/events/${eventId}`" class="text-sm font-medium text-moss hover:underline">← Event overview</NuxtLink>
    <div class="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold text-moss">People make the party</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Guest list</h1>
        <p v-if="event" class="mt-2 text-ink/60">{{ event.title }} · {{ guests.length }} {{ guests.length === 1 ? "guest" : "guests" }}</p>
      </div>
      <NuxtLink :to="`/events/${eventId}/edit`" class="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 text-sm font-medium hover:bg-paper">
        Edit event details
      </NuxtLink>
    </div>

    <p v-if="loading" class="mt-8 text-sm text-ink/60" role="status">Loading guests…</p>
    <p v-if="pageError" class="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ pageError }}</p>
    <template v-else-if="!loading">
      <p v-if="actionMessage" class="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-900" role="status">{{ actionMessage }}</p>
      <p v-if="actionError" class="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ actionError }}</p>

      <section class="mt-7 overflow-hidden rounded-3xl border border-line bg-white shadow-sm" aria-labelledby="guest-list-heading">
        <div class="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 id="guest-list-heading" class="text-lg font-semibold">Everyone invited</h2>
            <p class="mt-1 text-sm text-ink/55">Email is optional. Every guest can RSVP from their private link.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="min-h-10 rounded-full border border-line px-4 text-sm font-medium hover:bg-paper" @click="toggleAll">
              {{ selectedIds.length === guests.length && guests.length ? "Clear selection" : "Select all" }}
            </button>
            <button type="button" class="min-h-10 rounded-full border border-line px-4 text-sm font-medium hover:bg-paper disabled:opacity-50" :disabled="reminding" @click="sendReminders">
              {{ reminding ? "Queueing…" : "Send reminders" }}
            </button>
            <button
              type="button"
              class="min-h-10 rounded-full bg-moss px-4 text-sm font-semibold text-white hover:bg-moss-dark disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!selectedIds.length || sendingIds.length > 0"
              @click="sendInvitations(selectedIds)"
            >
              {{ sendingIds.length ? "Queueing…" : `Send email${selectedIds.length ? ` (${selectedIds.length})` : ""}` }}
            </button>
          </div>
        </div>

        <div v-if="!guests.length" class="px-6 py-12 text-center">
          <p class="text-lg font-semibold">A guest list of one is still a start.</p>
          <p class="mt-2 text-sm text-ink/60">Add your first guest below or import a CSV.</p>
        </div>

        <ul v-else class="divide-y divide-line">
          <li v-for="guest in guests" :key="guest.id" class="p-5 sm:px-6">
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                :checked="selectedIds.includes(guest.id)"
                :aria-label="`Select ${guest.name}`"
                class="mt-1 h-4 w-4 rounded border-line accent-moss"
                @change="toggleGuest(guest.id)"
              >
              <div class="min-w-0 flex-1">
                <template v-if="editingId === guest.id">
                  <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="saveEdit(guest)">
                    <label class="text-xs font-medium text-ink/65">
                      Name
                      <input v-model="editForm.name" required maxlength="160" class="mt-1 min-h-10 w-full rounded-lg border border-line px-3 text-sm text-ink">
                    </label>
                    <label class="text-xs font-medium text-ink/65">
                      Email (optional)
                      <input v-model="editForm.email" type="email" maxlength="320" class="mt-1 min-h-10 w-full rounded-lg border border-line px-3 text-sm text-ink">
                    </label>
                    <label class="text-xs font-medium text-ink/65">
                      Phone
                      <input v-model="editForm.phone" maxlength="40" class="mt-1 min-h-10 w-full rounded-lg border border-line px-3 text-sm text-ink">
                    </label>
                    <label class="text-xs font-medium text-ink/65">
                      Household / group
                      <input v-model="editForm.household" maxlength="160" class="mt-1 min-h-10 w-full rounded-lg border border-line px-3 text-sm text-ink">
                    </label>
                    <label class="text-xs font-medium text-ink/65">
                      Maximum party size
                      <input v-model.number="editForm.maxPartySize" type="number" min="1" max="50" required class="mt-1 min-h-10 w-full rounded-lg border border-line px-3 text-sm text-ink">
                    </label>
                    <label class="text-xs font-medium text-ink/65">
                      Dietary restrictions
                      <textarea v-model="editForm.dietaryRestrictions" rows="2" maxlength="10000" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
                    </label>
                    <label class="text-xs font-medium text-ink/65">
                      Private notes
                      <textarea v-model="editForm.notes" rows="2" maxlength="10000" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
                    </label>
                    <p v-if="editError" class="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{{ editError }}</p>
                    <div class="flex gap-2 sm:col-span-2">
                      <button type="submit" class="min-h-10 rounded-full bg-moss px-4 text-sm font-semibold text-white disabled:opacity-60" :disabled="editSaving">
                        {{ editSaving ? "Saving…" : "Save changes" }}
                      </button>
                      <button type="button" class="min-h-10 rounded-full border border-line px-4 text-sm" @click="editingId = null">Cancel</button>
                    </div>
                  </form>
                </template>
                <template v-else>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-semibold">{{ guest.name }}</h3>
                    <span v-if="!isEmailEligible(guest.email)" class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                      No email — share link
                    </span>
                    <span v-if="guest.household" class="rounded-full bg-paper px-2.5 py-1 text-xs text-ink/65">{{ guest.household }}</span>
                    <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="{
                      'bg-green-50 text-green-800': guest.rsvp?.status === 'ATTENDING',
                      'bg-red-50 text-red-800': guest.rsvp?.status === 'DECLINED',
                      'bg-amber-50 text-amber-900': guest.rsvp?.status === 'MAYBE',
                      'bg-paper text-ink/55': !guest.rsvp
                    }">
                      {{ guest.rsvp ? `${guest.rsvp.status.toLowerCase()}${guest.rsvp.status === 'ATTENDING' ? ` · ${guest.rsvp.partySize}` : ""}` : "pending" }}
                    </span>
                  </div>
                  <p class="mt-1 break-all text-sm text-ink/60">
                    {{ guest.email || guest.phone || "No email or phone number" }}
                    <span v-if="guest.email && guest.phone"> · {{ guest.phone }}</span>
                    · Up to {{ guest.maxPartySize }}
                  </p>
                  <p v-if="guest.invitation?.sentAt" class="mt-1 text-xs text-ink/45">Email invitation sent</p>
                </template>
              </div>
              <div v-if="editingId !== guest.id" class="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  class="min-h-9 rounded-full border border-line px-3 text-xs font-medium hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45"
                  :disabled="!isEmailEligible(guest.email) || sendingIds.includes(guest.id)"
                  :aria-label="`Send invitation email to ${guest.name}`"
                  @click="sendInvitations([guest.id])"
                >
                  {{ sendingIds.includes(guest.id) ? "Queueing…" : "Send email" }}
                </button>
                <button type="button" class="min-h-9 rounded-full border border-line px-3 text-xs font-medium hover:bg-paper" @click="copyLink(guest)">
                  {{ copiedGuestId === guest.id ? "Copied" : "Copy link" }}
                </button>
                <button type="button" class="min-h-9 rounded-full border border-line px-3 text-xs font-medium hover:bg-paper" @click="beginEdit(guest)">Edit</button>
                <button type="button" class="min-h-9 rounded-full border border-red-200 px-3 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50" :disabled="deletingId === guest.id" @click="deleteGuest(guest)">
                  {{ deletingId === guest.id ? "Removing…" : "Remove" }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="add-guest-heading">
          <button type="button" class="flex w-full items-center justify-between text-left" :aria-expanded="addOpen" aria-controls="add-guest-panel" @click="addOpen = !addOpen">
            <span>
              <span class="block text-sm font-semibold text-moss">Add someone</span>
              <span id="add-guest-heading" class="mt-1 block text-xl font-semibold">Add a guest</span>
            </span>
            <span class="grid h-9 w-9 place-items-center rounded-full bg-paper text-xl" aria-hidden="true">{{ addOpen ? "−" : "+" }}</span>
          </button>
          <form v-if="addOpen" id="add-guest-panel" class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="addGuest">
            <label class="text-sm font-medium sm:col-span-2">
              Guest name <span aria-hidden="true">*</span>
              <input v-model="addForm.name" required maxlength="160" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
            </label>
            <label class="text-sm font-medium">
              Email <span class="font-normal text-ink/50">(optional)</span>
              <input v-model="addForm.email" type="email" maxlength="320" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
            </label>
            <label class="text-sm font-medium">
              Phone <span class="font-normal text-ink/50">(optional)</span>
              <input v-model="addForm.phone" maxlength="40" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
            </label>
            <label class="text-sm font-medium">
              Household / group
              <input v-model="addForm.household" maxlength="160" class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
            </label>
            <label class="text-sm font-medium">
              Maximum party size
              <input v-model.number="addForm.maxPartySize" type="number" min="1" max="50" required class="mt-2 min-h-11 w-full rounded-xl border border-line px-3">
            </label>
            <label class="text-sm font-medium sm:col-span-2">
              Dietary restrictions
              <textarea v-model="addForm.dietaryRestrictions" rows="2" maxlength="10000" class="mt-2 w-full rounded-xl border border-line px-3 py-2" />
            </label>
            <label class="text-sm font-medium sm:col-span-2">
              Private notes
              <textarea v-model="addForm.notes" rows="2" maxlength="10000" class="mt-2 w-full rounded-xl border border-line px-3 py-2" />
            </label>
            <p v-if="addError" class="sm:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{{ addError }}</p>
            <button type="submit" class="min-h-11 rounded-full bg-moss px-5 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60 sm:col-span-2 sm:justify-self-start" :disabled="adding">
              {{ adding ? "Adding guest…" : "Add guest and create link" }}
            </button>
          </form>
        </section>

        <section class="rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="import-guests-heading">
          <p class="text-sm font-semibold text-moss">Bring a list with you</p>
          <h2 id="import-guests-heading" class="mt-1 text-xl font-semibold">Import from CSV</h2>
          <p class="mt-2 text-sm leading-6 text-ink/60">Use headers: name, email, phone, household, maxPartySize, notes, dietaryRestrictions. Email can be blank.</p>
          <label class="mt-5 block text-sm font-medium">
            Choose a CSV file
            <input type="file" accept=".csv,text/csv" class="mt-2 block w-full text-sm file:mr-3 file:min-h-10 file:rounded-full file:border-0 file:bg-[#e8eee8] file:px-4 file:font-medium file:text-moss" @change="readCsvFile">
          </label>
          <label class="mt-4 block text-sm font-medium">
            CSV contents
            <textarea v-model="csvText" rows="5" maxlength="2000000" placeholder="name,email&#10;Jamie,jamie@example.com&#10;Morgan," class="mt-2 w-full rounded-xl border border-line px-3 py-2 font-mono text-xs" />
          </label>
          <p v-if="csvError" class="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{{ csvError }}</p>
          <p v-if="csvResult" class="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900" role="status">{{ csvResult }}</p>
          <button type="button" class="mt-4 min-h-11 rounded-full border border-line px-5 text-sm font-semibold hover:bg-paper disabled:opacity-50" :disabled="!csvText.trim() || csvBusy" @click="importCsv">
            {{ csvBusy ? "Importing…" : "Import guests" }}
          </button>
        </section>
      </div>
    </template>
  </section>
</template>
