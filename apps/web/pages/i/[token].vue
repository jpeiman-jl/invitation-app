<script setup lang="ts">
import InvitationRenderer from "~/components/InvitationRenderer.vue";

interface PublicRsvp {
  status: "ATTENDING" | "DECLINED" | "MAYBE";
  partySize: number;
  companionNames: string[];
  dietary: string | null;
  message: string | null;
  respondedAt: string;
}

interface PublicInvitation {
  status: string;
  guest: {
    name: string;
    maxPartySize: number;
    rsvp: PublicRsvp | null;
  };
  event: {
    id: string;
    title: string;
    hostNames: string[];
    startsAt: string;
    timeZone: string;
    occasionTypes: import("@invitehub/shared").OccasionType[];
    venue: string | null;
    address: string | null;
    mapUrl: string | null;
    description: string | null;
    dressCode: string | null;
    rsvpDeadline: string | null;
    coverImageUrl: string | null;
    templateKey: string;
    template: unknown;
    programItems: import("@invitehub/shared").EventProgramItem[];
    seating: Array<{ table: string; seatNumber: number; attendeeName: string }>;
  };
}

const route = useRoute();
const { $api } = useNuxtApp();
const token = String(route.params.token);
const { data, error } = await useAsyncData(
  `public-invitation-${token}`,
  () => $api<{ invitation: PublicInvitation }>(`/api/v1/public/invitations/${token}`)
);
const invitation = ref<PublicInvitation | null>(data.value?.invitation ?? null);
const selectedStatus = ref<"" | PublicRsvp["status"]>("");
const partySize = ref(1);
const companionNames = ref<string[]>([]);
const dietary = ref("");
const message = ref("");
const submitting = ref(false);
const successMessage = ref("");
const submitError = ref("");

watch(data, (value) => {
  invitation.value = value?.invitation ?? null;
  if (value?.invitation.guest.rsvp) {
    selectedStatus.value = value.invitation.guest.rsvp.status;
    partySize.value = Math.max(1, value.invitation.guest.rsvp.partySize);
    companionNames.value = [...value.invitation.guest.rsvp.companionNames];
    dietary.value = value.invitation.guest.rsvp.dietary ?? "";
    message.value = value.invitation.guest.rsvp.message ?? "";
  }
}, { immediate: true });

const event = computed(() => invitation.value?.event ?? null);
const guest = computed(() => invitation.value?.guest ?? null);
const rsvpOptions = [
  { value: "ATTENDING", label: "Joyfully accept" },
  { value: "DECLINED", label: "Regretfully decline" },
  { value: "MAYBE", label: "Not sure yet" }
] as const;
const deadlinePassed = computed(() => Boolean(
  event.value?.rsvpDeadline && new Date(event.value.rsvpDeadline).getTime() < Date.now()
));

useSeoMeta({
  title: () => event.value?.title ? `Invitation: ${event.value.title}` : "You're invited",
  description: () => event.value
    ? `You're invited to ${event.value.title}. View the details and RSVP on InviteHub.`
    : "A personal invitation from InviteHub.",
  ogTitle: () => event.value?.title ?? "You're invited",
  ogDescription: () => event.value
    ? `You're invited to ${event.value.title}. Tap to see the details and RSVP.`
    : "A personal invitation from InviteHub.",
  ogImage: () => event.value?.coverImageUrl ?? undefined,
  twitterCard: "summary_large_image"
});

watch(partySize, (size) => {
  const companionCount = Math.max(0, size - 1);
  companionNames.value = companionNames.value.slice(0, companionCount);
  while (companionNames.value.length < companionCount) {
    companionNames.value.push("");
  }
});

function formatDeadline(value: string): string {
  if (!event.value) return value;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: event.value.timeZone
  }).format(new Date(value));
}

function apiError(errorValue: unknown): string {
  if (typeof errorValue === "object" && errorValue !== null && "data" in errorValue &&
      typeof errorValue.data === "object" && errorValue.data !== null && "error" in errorValue.data &&
      typeof errorValue.data.error === "string") {
    return errorValue.data.error;
  }
  return "Your RSVP couldn't be sent. Please try again.";
}

async function submitRsvp(): Promise<void> {
  if (!selectedStatus.value || !guest.value) {
    submitError.value = "Choose whether you're attending, not attending, or maybe.";
    return;
  }
  submitting.value = true;
  submitError.value = "";
  successMessage.value = "";
  try {
    await $api<{ status: string }>("/health");
    const result = await $api<{ rsvp: PublicRsvp; emailConfirmation: "queued" | "skipped" | "failed" }>(
      `/api/v1/public/invitations/${token}/rsvp`,
      {
        method: "POST",
        body: {
          status: selectedStatus.value,
          partySize: selectedStatus.value === "ATTENDING" ? partySize.value : 0,
          companionNames: selectedStatus.value === "ATTENDING"
            ? companionNames.value.map((name) => name.trim()).filter(Boolean)
            : [],
          dietary: dietary.value.trim() || null,
          message: message.value.trim() || null
        }
      }
    );
    if (invitation.value) {
      invitation.value.guest.rsvp = result.rsvp;
      invitation.value.status = "RESPONDED";
    }
    successMessage.value = result.emailConfirmation === "failed"
      ? "Your RSVP is saved. We couldn't queue a confirmation email, but your response has been recorded."
      : "Your RSVP is saved. Thanks for letting your host know.";
  } catch (errorValue) {
    submitError.value = apiError(errorValue);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
    <div v-if="error || !invitation" class="mx-auto max-w-xl rounded-3xl border border-line bg-white p-8 text-center shadow-soft sm:p-12">
      <p class="text-sm font-semibold text-moss">A note for you</p>
      <h1 class="mt-3 text-2xl font-semibold">This invitation isn't available</h1>
      <p class="mt-3 text-sm leading-6 text-ink/60">The link may have expired or been copied incorrectly. Please ask your host for a new one.</p>
    </div>
    <div v-else-if="event && guest" class="mx-auto max-w-3xl">
      <div class="mb-5 text-center">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-moss">A personal invitation</p>
      </div>
      <InvitationRenderer :event="event" :guest-name="guest.name" />

      <section class="mt-6 rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-9" aria-labelledby="rsvp-heading">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-moss">A quick note back</p>
            <h2 id="rsvp-heading" class="mt-1 text-2xl font-semibold">Will you be there?</h2>
          </div>
          <p v-if="event.rsvpDeadline" class="text-sm text-ink/55">
            Please reply by <time :datetime="event.rsvpDeadline">{{ formatDeadline(event.rsvpDeadline) }}</time>
          </p>
        </div>

        <p v-if="deadlinePassed" class="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950" role="status">
          The RSVP deadline has passed. Please contact your host if your plans have changed.
        </p>
        <p v-if="successMessage" class="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-950" role="status">
          {{ successMessage }}
        </p>

        <form v-if="!deadlinePassed" class="mt-6 space-y-6" @submit.prevent="submitRsvp">
          <fieldset>
            <legend class="mb-3 text-sm font-medium">Choose one</legend>
            <div class="grid gap-3 sm:grid-cols-3">
              <label v-for="option in rsvpOptions" :key="option.value" class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4" :class="selectedStatus === option.value ? 'border-moss bg-[#f2f6f1]' : 'border-line hover:bg-paper/60'">
                <input v-model="selectedStatus" type="radio" name="rsvpStatus" :value="option.value" required class="h-4 w-4 accent-moss">
                <span class="text-sm font-medium">{{ option.label }}</span>
              </label>
            </div>
          </fieldset>

          <div v-if="selectedStatus === 'ATTENDING'" class="grid gap-5 rounded-2xl bg-paper/70 p-5 sm:grid-cols-2">
            <label class="text-sm font-medium">
              How many people in your party?
              <select v-model.number="partySize" class="mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3">
                <option v-for="size in guest.maxPartySize" :key="size" :value="size">
                  {{ size }} {{ size === 1 ? "person" : "people" }}
                </option>
              </select>
            </label>
            <div v-if="partySize > 1" class="space-y-3 sm:col-span-2">
              <label v-for="(_, index) in companionNames" :key="index" class="block text-sm font-medium">
                Companion {{ index + 1 }} name <span class="font-normal text-ink/50">(optional)</span>
                <input v-model="companionNames[index]" maxlength="160" class="mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3">
              </label>
            </div>
          </div>

          <label class="block text-sm font-medium">
            Dietary needs <span class="font-normal text-ink/50">(optional)</span>
            <textarea v-model="dietary" rows="2" maxlength="10000" class="mt-2 w-full rounded-xl border border-line px-3 py-2" />
          </label>
          <label class="block text-sm font-medium">
            A message for your host <span class="font-normal text-ink/50">(optional)</span>
            <textarea v-model="message" rows="3" maxlength="10000" class="mt-2 w-full rounded-xl border border-line px-3 py-2" />
          </label>

          <p v-if="submitError" class="rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{{ submitError }}</p>
          <button type="submit" class="min-h-12 w-full rounded-full bg-moss px-6 font-semibold text-white hover:bg-moss-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto" :disabled="submitting">
            {{ submitting ? "Sending your RSVP…" : guest.rsvp ? "Update my RSVP" : "Send my RSVP" }}
          </button>
          <p class="text-xs leading-5 text-ink/50">Your host can see your RSVP and any note you leave here.</p>
        </form>

        <p v-if="event.seating.length" class="mt-6 rounded-2xl bg-[#edf2ed] p-5 text-sm" role="status">
          <span class="block font-semibold">Your seat information</span>
          <span v-for="seat in event.seating" :key="`${seat.table}-${seat.seatNumber}`" class="mt-2 block text-ink/70">
            {{ seat.attendeeName }} · {{ seat.table }}, seat {{ seat.seatNumber }}
          </span>
        </p>
      </section>
      <p class="py-6 text-center text-xs text-ink/45">Made with care using InviteHub</p>
    </div>
  </main>
</template>
