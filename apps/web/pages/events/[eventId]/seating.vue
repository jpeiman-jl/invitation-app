<script setup lang="ts">
import {
  createEventTableSchema,
  EVENT_TABLE_TYPES,
  type EventTableType
} from "@invitehub/shared";
import { useAuthStore } from "~/stores/auth";
import { apiErrorMessage } from "~/utils/api-error";

interface SeatAssignmentView {
  id: string;
  guestId: string;
  seatNumber: number;
  attendeeName: string;
  isPrimaryGuest: boolean;
}

interface EventTableView {
  id: string;
  label: string;
  type: EventTableType;
  customType: string | null;
  capacity: number;
  positionX: number;
  positionY: number;
  assignments: SeatAssignmentView[];
}

interface SeatableGuestView {
  id: string;
  name: string;
  household: string | null;
  rsvp: {
    status: "ATTENDING" | "DECLINED" | "MAYBE" | null;
    partySize: number;
    companionNames: string[];
  };
}

const route = useRoute();
const eventId = computed(() => String(route.params.eventId));
const auth = useAuthStore();
const { $api } = useNuxtApp();
const eventTitle = ref("");
const tables = ref<EventTableView[]>([]);
const seatableGuests = ref<SeatableGuestView[]>([]);
const unassignedGuests = ref<SeatableGuestView[]>([]);
const seatingPublishedAt = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);
const assigning = ref(false);
const autoAssigning = ref(false);
const publishing = ref(false);
const pageError = ref("");
const actionMessage = ref("");
const formError = ref("");
const editingTableId = ref<string | null>(null);
const selectedGuestId = ref("");
const selectedTableId = ref("");
const typeChoices = EVENT_TABLE_TYPES;
const form = reactive<{
  label: string;
  type: EventTableType;
  customType: string;
  capacity: number;
}>({
  label: "",
  type: "ROUND",
  customType: "",
  capacity: 8
});

useSeoMeta({ title: "Seating chart" });

onMounted(async () => {
  try {
    await auth.load();
    if (!auth.user) {
      await navigateTo("/auth/login");
      return;
    }
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The seating plan couldn't be loaded.");
  } finally {
    loading.value = false;
  }
});

async function loadSeating(): Promise<void> {
  const [eventResult, seatingResult] = await Promise.all([
    $api<{ event: { title: string } }>(`/api/v1/events/${eventId.value}`),
    $api<{
      tables: EventTableView[];
      seatableGuests: SeatableGuestView[];
      unassignedGuests: SeatableGuestView[];
      seatingPublishedAt: string | null;
    }>(`/api/v1/events/${eventId.value}/seating`)
  ]);
  eventTitle.value = eventResult.event.title;
  tables.value = seatingResult.tables;
  seatableGuests.value = seatingResult.seatableGuests;
  unassignedGuests.value = seatingResult.unassignedGuests;
  seatingPublishedAt.value = seatingResult.seatingPublishedAt;
  if (!tables.value.some((table) => table.id === selectedTableId.value)) {
    selectedTableId.value = tables.value[0]?.id ?? "";
  }
  if (!seatableGuests.value.some((guest) => guest.id === selectedGuestId.value)) {
    selectedGuestId.value = unassignedGuests.value[0]?.id ?? "";
  }
}

const selectedTable = computed(() =>
  tables.value.find((table) => table.id === selectedTableId.value) ?? null
);
const guestNames = computed(() => Object.fromEntries(
  seatableGuests.value.map((guest) => [guest.id, guest.name])
));
const assignedGuestIds = computed(() => new Set(
  tables.value.flatMap((table) => table.assignments.map((assignment) => assignment.guestId))
));
const assignedSeatCount = computed(() =>
  tables.value.reduce((sum, table) => sum + table.assignments.length, 0)
);
const totalSeatCount = computed(() =>
  tables.value.reduce((sum, table) => sum + table.capacity, 0)
);
function tableTypeLabel(table: EventTableView): string {
  return table.type === "CUSTOM" ? table.customType ?? "Custom" : table.type.toLowerCase();
}

function printSeating(): void {
  window.print();
}

function startGuestDrag(event: DragEvent, guestId: string): void {
  event.dataTransfer?.setData("text/plain", `guest:${guestId}`);
}

function resetForm(): void {
  editingTableId.value = null;
  Object.assign(form, { label: "", type: "ROUND", customType: "", capacity: 8 });
  formError.value = "";
}

function editTable(table: EventTableView): void {
  editingTableId.value = table.id;
  Object.assign(form, {
    label: table.label,
    type: table.type,
    customType: table.customType ?? "",
    capacity: table.capacity
  });
  formError.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveTable(): Promise<void> {
  formError.value = "";
  actionMessage.value = "";
  const parsed = createEventTableSchema.safeParse({
    label: form.label,
    type: form.type,
    customType: form.type === "CUSTOM" ? form.customType : null,
    capacity: form.capacity,
    positionX: 50,
    positionY: 50
  });
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? "Check the table details.";
    return;
  }

  saving.value = true;
  try {
    const url = editingTableId.value
      ? `/api/v1/events/${eventId.value}/tables/${editingTableId.value}`
      : `/api/v1/events/${eventId.value}/tables`;
    await $api(url, {
      method: editingTableId.value ? "PATCH" : "POST",
      body: parsed.data
    });
    actionMessage.value = editingTableId.value ? "Table updated." : "Table added.";
    resetForm();
    await loadSeating();
  } catch (error) {
    formError.value = apiErrorMessage(error, "The table couldn't be saved.");
  } finally {
    saving.value = false;
  }
}

async function deleteTable(table: EventTableView): Promise<void> {
  if (!window.confirm(`Delete ${table.label}? Guests at this table will become unassigned.`)) {
    return;
  }
  pageError.value = "";
  actionMessage.value = "";
  try {
    await $api(`/api/v1/events/${eventId.value}/tables/${table.id}`, { method: "DELETE" });
    actionMessage.value = `${table.label} deleted.`;
    if (editingTableId.value === table.id) {
      resetForm();
    }
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The table couldn't be deleted.");
  }
}

async function assignGuest(guestId: string, tableId: string, seatNumber?: number): Promise<void> {
  if (!guestId) {
    return;
  }
  assigning.value = true;
  pageError.value = "";
  actionMessage.value = "";
  try {
    await $api(`/api/v1/events/${eventId.value}/tables/${tableId}/assignments`, {
      method: "POST",
      body: { guestId, ...(seatNumber === undefined ? {} : { seatNumber }) }
    });
    actionMessage.value = "Guest party seated.";
    selectedGuestId.value = "";
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The guest couldn't be assigned to these seats.");
  } finally {
    assigning.value = false;
  }
}

async function moveAssignment(assignmentId: string, tableId: string, seatNumber: number): Promise<void> {
  assigning.value = true;
  pageError.value = "";
  actionMessage.value = "";
  try {
    await $api(`/api/v1/events/${eventId.value}/assignments/${assignmentId}`, {
      method: "PATCH",
      body: { tableId, seatNumber }
    });
    actionMessage.value = "Seat arrangement updated.";
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The seat couldn't be moved.");
  } finally {
    assigning.value = false;
  }
}

async function unassignGuest(guestId: string, guestName: string): Promise<void> {
  pageError.value = "";
  actionMessage.value = "";
  try {
    await $api(`/api/v1/events/${eventId.value}/assignments/${guestId}`, { method: "DELETE" });
    actionMessage.value = `${guestName}'s party is unassigned.`;
    selectedGuestId.value = guestId;
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The guest couldn't be unassigned.");
  }
}

async function autoAssign(): Promise<void> {
  if (!window.confirm("Auto-assign all guests who have not declined? This replaces the current seating plan and keeps households together.")) {
    return;
  }
  autoAssigning.value = true;
  pageError.value = "";
  actionMessage.value = "";
  try {
    const result = await $api<{
      assignedGuests: number;
      assignedSeats: number;
      unassignedGuestNames: string[];
    }>(`/api/v1/events/${eventId.value}/seating/auto-assign`, { method: "POST" });
    actionMessage.value = `${result.assignedGuests} guest parties seated (${result.assignedSeats} seats). ${
      result.unassignedGuestNames.length
        ? `${result.unassignedGuestNames.length} couldn't fit: ${result.unassignedGuestNames.join(", ")}.`
        : "Everyone fits."
    }`;
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "Automatic seating couldn't be completed.");
  } finally {
    autoAssigning.value = false;
  }
}

async function togglePublication(): Promise<void> {
  const published = !seatingPublishedAt.value;
  if (published && unassignedGuests.value.length > 0 && !window.confirm(
    `${unassignedGuests.value.length} attending guest parties are unassigned. Publish the current seating anyway?`
  )) {
    return;
  }
  publishing.value = true;
  pageError.value = "";
  actionMessage.value = "";
  try {
    await $api(`/api/v1/events/${eventId.value}/seating/publication`, {
      method: "PATCH",
      body: { published }
    });
    actionMessage.value = published
      ? "Seating is now visible on guest invitation pages."
      : "Seating is hidden from guest invitation pages.";
    await loadSeating();
  } catch (error) {
    pageError.value = apiErrorMessage(error, "The publication setting couldn't be changed.");
  } finally {
    publishing.value = false;
  }
}

function exportCsv(): void {
  const rows = [
    ["Table", "Table type", "Seat", "Attendee", "Invited guest"],
    ...tables.value.flatMap((table) => table.assignments.map((assignment) => [
      table.label,
      table.type === "CUSTOM" ? table.customType ?? "Custom" : table.type.toLowerCase(),
      String(assignment.seatNumber),
      assignment.attendeeName,
      guestNames.value[assignment.guestId] ?? ""
    ]))
  ];
  const csv = rows.map((row) =>
    row.map((field) => `"${field.replaceAll('"', '""')}"`).join(",")
  ).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${eventTitle.value.trim().replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-seating.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
    <NuxtLink :to="`/events/${eventId}`" class="text-sm font-medium text-moss hover:underline">← Event overview</NuxtLink>
    <div class="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-sm font-semibold text-moss">Seating plan</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{{ eventTitle || "Your event" }}</h1>
        <p class="mt-2 text-sm text-ink/60">Arrange confirmed and provisional seats. Pending guests get one seat until they RSVP.</p>
      </div>
      <div class="no-print flex flex-wrap gap-2">
        <button type="button" class="min-h-11 rounded-full border border-line bg-white px-4 text-sm font-medium hover:bg-paper" :disabled="!tables.length" @click="exportCsv">
          Export CSV
        </button>
        <button type="button" class="min-h-11 rounded-full border border-line bg-white px-4 text-sm font-medium hover:bg-paper" :disabled="!tables.length" @click="printSeating">
          Print / save PDF
        </button>
        <button type="button" class="min-h-11 rounded-full bg-moss px-4 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60" :disabled="autoAssigning || !tables.length || !seatableGuests.length" @click="autoAssign">
          {{ autoAssigning ? "Assigning…" : "Auto-assign households" }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="mt-8 text-sm text-ink/60" role="status">Loading seating plan…</p>
    <template v-else>
      <p v-if="pageError" class="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ pageError }}</p>
      <p v-if="actionMessage" class="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-900" role="status">{{ actionMessage }}</p>

      <div class="mt-6 grid gap-4 sm:grid-cols-3">
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Seat assignments</p>
          <p class="mt-2 text-2xl font-semibold">{{ assignedSeatCount }} <span class="text-base font-normal text-ink/55">/ {{ totalSeatCount }}</span></p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Guests eligible for seating</p>
          <p class="mt-2 text-2xl font-semibold">{{ seatableGuests.length }}</p>
        </article>
        <article class="rounded-2xl border border-line bg-white p-5">
          <p class="text-sm text-ink/60">Unassigned guests</p>
          <p class="mt-2 text-2xl font-semibold" :class="unassignedGuests.length ? 'text-amber-800' : 'text-moss'">{{ unassignedGuests.length }}</p>
        </article>
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.7fr)]">
        <div class="space-y-5">
          <section class="no-print rounded-3xl border border-line bg-white p-6 sm:p-8" aria-labelledby="assign-heading">
            <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p class="text-sm font-semibold text-moss">Assign or move guests</p>
                <h2 id="assign-heading" class="mt-1 text-xl font-semibold">Choose a guest, then a seat</h2>
              </div>
              <div class="grid flex-1 gap-3 sm:grid-cols-3 md:max-w-2xl">
                <label class="text-xs font-medium text-ink/65">
                  Guest
                  <select v-model="selectedGuestId" class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink">
                    <option value="">Select a guest</option>
                    <option v-for="guest in seatableGuests" :key="guest.id" :value="guest.id">
                      {{ guest.name }} · {{ guest.rsvp.partySize }} {{ guest.rsvp.partySize === 1 ? "seat" : "seats" }} · {{ guest.rsvp.status === null ? "pending RSVP" : guest.rsvp.status.toLowerCase() }}{{ assignedGuestIds.has(guest.id) ? " · assigned" : "" }}
                    </option>
                  </select>
                </label>
                <label class="text-xs font-medium text-ink/65">
                  Table
                  <select v-model="selectedTableId" class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink">
                    <option value="">Select a table</option>
                    <option v-for="table in tables" :key="table.id" :value="table.id">{{ table.label }}</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="min-h-11 self-end rounded-xl bg-moss px-4 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-50"
                  :disabled="assigning || !selectedGuestId || !selectedTable"
                  @click="assignGuest(selectedGuestId, selectedTableId)"
                >
                  {{ assigning ? "Seating…" : "Find open seats" }}
                </button>
              </div>
            </div>
            <p class="mt-3 text-xs leading-5 text-ink/55">Drag an unassigned guest to a seat. Drag any seated name to another seat to move it; dropping onto an occupied seat swaps the two seats. Unconfirmed guests reserve one provisional seat.</p>
            <div v-if="unassignedGuests.length" class="mt-5 flex flex-wrap gap-2" aria-label="Unassigned attending guests">
              <button
                v-for="guest in unassignedGuests"
                :key="guest.id"
                type="button"
                draggable="true"
                class="cursor-grab rounded-full border border-dashed border-moss/40 bg-[#edf2ed] px-3 py-2 text-sm font-medium text-moss active:cursor-grabbing"
                :aria-label="`Drag ${guest.name}, ${guest.rsvp.partySize} provisional or confirmed seats`"
                @click="selectedGuestId = guest.id"
                @dragstart="startGuestDrag($event, guest.id)"
              >
                {{ guest.name }} · {{ guest.rsvp.partySize }}{{ guest.rsvp.status === null ? " · pending" : guest.rsvp.status === "MAYBE" ? " · maybe" : "" }}
              </button>
            </div>
            <p v-else-if="seatableGuests.length" class="mt-4 text-sm text-moss">All eligible guests have seats. Drag a seated name to rearrange it.</p>
            <p v-else class="mt-4 text-sm text-ink/55">Add guests to the event to start arranging seats. Guests who decline are excluded.</p>
          </section>

          <section v-if="tables.length" class="grid gap-5 sm:grid-cols-2" aria-label="Seating chart">
            <SeatingTable
              v-for="table in tables"
              :key="table.id"
              :table="table"
              :can-assign="Boolean(selectedGuestId) && !assigning"
              :can-move="!assigning"
              :guest-names="guestNames"
              @assign="assignGuest(selectedGuestId, table.id, $event)"
              @drop-guest="assignGuest($event.guestId, table.id, $event.seatNumber)"
              @move-assignment="moveAssignment($event.assignmentId, table.id, $event.seatNumber)"
            />
          </section>
          <section v-else class="rounded-3xl border border-dashed border-line bg-white p-8 text-center">
            <h2 class="text-lg font-semibold">Start with your first table</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/60">Add tables with a shape and seat capacity to build a visual plan for your event.</p>
          </section>
        </div>

        <aside class="space-y-5">
          <section class="no-print rounded-3xl border border-line bg-white p-6" aria-labelledby="table-form-heading">
            <p class="text-sm font-semibold text-moss">{{ editingTableId ? "Edit table" : "Create a table" }}</p>
            <h2 id="table-form-heading" class="mt-1 text-xl font-semibold">{{ editingTableId ? "Update table details" : "Add a table" }}</h2>
            <form class="mt-5 space-y-4" @submit.prevent="saveTable">
              <label class="block text-xs font-medium text-ink/65">
                Table name or number
                <input v-model="form.label" required maxlength="100" class="mt-1.5 min-h-11 w-full rounded-xl border border-line px-3 text-sm text-ink" placeholder="Table 1">
              </label>
              <label class="block text-xs font-medium text-ink/65">
                Table type
                <select v-model="form.type" class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink">
                  <option v-for="type in typeChoices" :key="type" :value="type">{{ type.toLowerCase() }}</option>
                </select>
              </label>
              <label v-if="form.type === 'CUSTOM'" class="block text-xs font-medium text-ink/65">
                Custom type name
                <input v-model="form.customType" required maxlength="100" class="mt-1.5 min-h-11 w-full rounded-xl border border-line px-3 text-sm text-ink" placeholder="Garden lounge">
              </label>
              <label class="block text-xs font-medium text-ink/65">
                Seat capacity
                <input v-model.number="form.capacity" required type="number" min="1" max="500" class="mt-1.5 min-h-11 w-full rounded-xl border border-line px-3 text-sm text-ink">
              </label>
              <p v-if="formError" class="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{{ formError }}</p>
              <div class="flex gap-2">
                <button type="submit" class="min-h-11 flex-1 rounded-full bg-moss px-4 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60" :disabled="saving">
                  {{ saving ? "Saving…" : editingTableId ? "Save changes" : "Add table" }}
                </button>
                <button v-if="editingTableId" type="button" class="min-h-11 rounded-full border border-line px-4 text-sm font-medium hover:bg-paper" @click="resetForm">Cancel</button>
              </div>
            </form>
          </section>

          <section class="rounded-3xl border border-line bg-white p-6" aria-labelledby="table-list-heading">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-moss">Table list</p>
                <h2 id="table-list-heading" class="mt-1 text-xl font-semibold">Seats & guests</h2>
              </div>
              <span class="rounded-full bg-paper px-3 py-1 text-xs font-medium">{{ tables.length }} tables</span>
            </div>
            <ul v-if="tables.length" class="mt-4 divide-y divide-line">
              <li v-for="table in tables" :key="table.id" class="py-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="font-semibold">{{ table.label }}</p>
                    <p class="mt-0.5 text-xs capitalize text-ink/55">{{ tableTypeLabel(table) }} · {{ table.assignments.length }} / {{ table.capacity }} seats</p>
                  </div>
                  <div class="no-print flex shrink-0 gap-2">
                    <button type="button" class="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:bg-paper" :aria-label="`Edit ${table.label}`" @click="editTable(table)">Edit</button>
                    <button type="button" class="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50" :aria-label="`Delete ${table.label}`" @click="deleteTable(table)">Delete</button>
                  </div>
                </div>
                <ul v-if="table.assignments.length" class="mt-3 space-y-2 pl-3">
                  <li v-for="assignment in table.assignments" :key="assignment.id" class="flex items-center justify-between gap-2 text-sm">
                    <span class="min-w-0 truncate">
                      <span class="text-ink/50">Seat {{ assignment.seatNumber }} · </span>{{ assignment.attendeeName }}
                      <span v-if="!assignment.isPrimaryGuest" class="ml-1 text-xs text-ink/50">with {{ guestNames[assignment.guestId] ?? "primary guest" }}</span>
                      <span v-else-if="seatableGuests.find((guest) => guest.id === assignment.guestId)?.rsvp.status === null" class="ml-1 text-xs text-amber-800">· pending RSVP</span>
                    </span>
                    <button
                      v-if="assignment.isPrimaryGuest"
                      type="button"
                      class="no-print shrink-0 text-xs font-medium text-moss hover:underline"
                      @click="unassignGuest(assignment.guestId, assignment.attendeeName)"
                    >
                      Unassign party
                    </button>
                  </li>
                </ul>
                <p v-else class="mt-3 pl-3 text-xs text-ink/50">No seats assigned yet.</p>
              </li>
            </ul>
            <p v-else class="mt-4 text-sm text-ink/55">No tables yet.</p>
          </section>

          <section class="no-print rounded-3xl border border-line bg-[#edf2ed] p-6" aria-labelledby="publish-heading">
            <p class="text-sm font-semibold text-moss">Guest visibility</p>
            <h2 id="publish-heading" class="mt-1 text-xl font-semibold">{{ seatingPublishedAt ? "Seating is published" : "Seating is private" }}</h2>
            <p class="mt-2 text-sm leading-6 text-ink/65">
              {{ seatingPublishedAt
                ? "Guests can see their table and seat on their invitation page."
                : "Publish when you're ready; guests will only see their own assigned seats." }}
            </p>
            <p v-if="unassignedGuests.length" class="mt-3 text-xs font-medium text-amber-900">
              {{ unassignedGuests.length }} guests who have not declined still need seats.
            </p>
            <button type="button" class="mt-4 min-h-11 w-full rounded-full bg-moss px-4 text-sm font-semibold text-white hover:bg-moss-dark disabled:opacity-60" :disabled="publishing || (!seatingPublishedAt && !tables.length)" @click="togglePublication">
              {{ publishing ? "Updating…" : seatingPublishedAt ? "Hide seating from guests" : "Publish seating" }}
            </button>
          </section>
        </aside>
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

  section {
    break-inside: avoid;
  }
}
</style>
