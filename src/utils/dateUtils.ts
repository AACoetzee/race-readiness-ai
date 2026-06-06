export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function formatDateForInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getDaysBetweenDates(startDate: string, endDate: Date) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${formatDateForInput(endDate)}T00:00:00`);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / millisecondsPerDay)
  );
}
