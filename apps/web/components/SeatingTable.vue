<script setup lang="ts">
interface SeatAssignmentView {
  id: string;
  guestId: string;
  seatNumber: number;
  attendeeName: string;
  isPrimaryGuest: boolean;
}

interface TableView {
  id: string;
  label: string;
  type: string;
  customType: string | null;
  capacity: number;
  assignments: SeatAssignmentView[];
}

const props = defineProps<{
  table: TableView;
  canAssign: boolean;
  canMove: boolean;
  guestNames: Record<string, string>;
}>();

const emit = defineEmits<{
  assign: [seatNumber: number];
  dropGuest: [value: { guestId: string; seatNumber: number }];
  moveAssignment: [value: { assignmentId: string; seatNumber: number }];
}>();

const assignmentsBySeat = computed(() => new Map(
  props.table.assignments.map((assignment) => [assignment.seatNumber, assignment])
));

function seatPosition(index: number): { left: string; top: string } {
  const capacity = props.table.capacity;
  if (props.table.type === "ROUND") {
    const angle = (2 * Math.PI * index) / capacity - Math.PI / 2;
    return {
      left: `${50 + Math.cos(angle) * 43}%`,
      top: `${50 + Math.sin(angle) * 42}%`
    };
  }

  const width = 82;
  const height = 66;
  const perimeter = 2 * (width + height);
  let distance = (perimeter * index) / capacity;
  if (distance <= width) {
    return { left: `${9 + distance}%`, top: "10%" };
  }
  distance -= width;
  if (distance <= height) {
    return { left: "91%", top: `${10 + distance}%` };
  }
  distance -= height;
  if (distance <= width) {
    return { left: `${91 - distance}%`, top: "90%" };
  }
  distance -= width;
  return { left: "9%", top: `${90 - distance}%` };
}

function onDrop(event: DragEvent, seatNumber: number): void {
  event.preventDefault();
  const draggedItem = event.dataTransfer?.getData("text/plain") ?? "";
  if (draggedItem.startsWith("assignment:")) {
    emit("moveAssignment", { assignmentId: draggedItem.slice("assignment:".length), seatNumber });
  } else if (draggedItem.startsWith("guest:")) {
    emit("dropGuest", { guestId: draggedItem.slice("guest:".length), seatNumber });
  }
}

function startAssignmentDrag(event: DragEvent, assignmentId: string): void {
  event.dataTransfer?.setData("text/plain", `assignment:${assignmentId}`);
}

function onSeatClick(seatNumber: number): void {
  if (!assignmentsBySeat.value.has(seatNumber) && props.canAssign) {
    emit("assign", seatNumber);
  }
}

function seatTooltip(assignment: SeatAssignmentView): string {
  const primaryName = props.guestNames[assignment.guestId] ?? "the primary guest";
  return assignment.isPrimaryGuest
    ? `${assignment.attendeeName} (primary guest)`
    : `${assignment.attendeeName} (with ${primaryName})`;
}
</script>

<template>
  <article class="rounded-3xl border border-line bg-white p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold">{{ table.label }}</h3>
        <p class="mt-1 text-xs text-ink/60">{{ table.type === "CUSTOM" ? table.customType : table.type.toLowerCase() }}</p>
      </div>
      <span class="rounded-full bg-paper px-3 py-1 text-xs font-medium">
        {{ table.assignments.length }} / {{ table.capacity }} seats
      </span>
    </div>

    <div class="relative mx-auto mt-3 h-72 max-w-sm" :aria-label="`${table.label} seating chart`" role="group">
      <div
        class="table-surface absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center border border-moss/30 bg-[#edf2ed] p-3 text-center"
        :class="`shape-${table.type.toLowerCase()}`"
      >
        <span class="max-w-28 truncate text-sm font-semibold text-moss">{{ table.label }}</span>
      </div>
      <button
        v-for="seatNumber in table.capacity"
        :key="seatNumber"
        type="button"
        class="seat-dot absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px] font-semibold shadow-sm transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss"
        :class="assignmentsBySeat.has(seatNumber)
          ? 'border-moss bg-moss text-white'
          : canAssign || canMove
            ? 'border-line bg-white text-ink/60 hover:border-moss'
            : 'border-line bg-paper text-ink/35'"
        :style="seatPosition(seatNumber - 1)"
        :disabled="assignmentsBySeat.has(seatNumber) ? !canMove : !canAssign && !canMove"
        :aria-label="assignmentsBySeat.has(seatNumber)
          ? `Seat ${seatNumber}: ${seatTooltip(assignmentsBySeat.get(seatNumber)!)}`
          : `Seat ${seatNumber}${canAssign ? ', assign selected guest here' : ', empty'}`"
        :title="assignmentsBySeat.has(seatNumber) ? seatTooltip(assignmentsBySeat.get(seatNumber)!) : `Seat ${seatNumber}`"
        @click="onSeatClick(seatNumber)"
        @dragover.prevent
        @drop="onDrop($event, seatNumber)"
      >
        <span
          v-if="assignmentsBySeat.has(seatNumber)"
          draggable="true"
          class="grid h-full w-full place-items-center rounded-full"
          @dragstart="startAssignmentDrag($event, assignmentsBySeat.get(seatNumber)!.id)"
        >{{ assignmentsBySeat.get(seatNumber)?.attendeeName.slice(0, 1) }}</span>
        <span v-else>{{ seatNumber }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.table-surface {
  width: 52%;
  height: 44%;
}

.shape-round,
.shape-cocktail {
  width: 43%;
  height: 43%;
  border-radius: 9999px;
}

.shape-square {
  width: 48%;
  height: 48%;
  border-radius: 1.25rem;
}

.shape-rectangular,
.shape-banquet {
  width: 58%;
  height: 35%;
  border-radius: 1rem;
}

.shape-head,
.shape-sweetheart {
  width: 54%;
  height: 38%;
  border-radius: 9999px;
}
</style>
