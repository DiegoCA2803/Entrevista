export function localDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}
export function shiftWindow(date: string, period: string, hours: number) {
  const start = new Date(`${date}T${period === 'DIA' ? '06' : '18'}:00:00-05:00`).getTime();
  return { start, end: start + hours * 3600000 };
}
export function shiftLastDate(date: string, period: string, hours: number): string {
  const { end } = shiftWindow(date, period, hours);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(end - 1));
}
