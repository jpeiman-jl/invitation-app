function dateTimeParts(value: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function toZonedDateTimeInput(isoDate: string, timeZone: string): string {
  const parts = dateTimeParts(new Date(isoDate), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromZonedDateTimeInput(value: string, timeZone: string): string {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) {
    throw new Error("A complete local date and time is required");
  }
  const [yearText, monthText, dayText] = datePart.split("-");
  const [hourText, minuteText] = timePart.split(":");
  const components = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  if (components.some((part) => !Number.isInteger(part))) {
    throw new Error("The date and time are invalid");
  }
  const [year, month, day, hour, minute] = components as [number, number, number, number, number];
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateTimeParts(new Date(guess), timeZone);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    const adjustment = targetUtc - representedUtc;
    if (adjustment === 0) {
      return new Date(guess).toISOString();
    }
    guess += adjustment;
  }

  return new Date(guess).toISOString();
}
