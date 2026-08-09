const ROOM_FEES: Record<string, number> = {
  short: 30,
  standard: 40,
  intensive: 120,
};

const SEAT_FEES: Record<string, number> = {
  short: 15,
  standard: 20,
  intensive: 60,
};

const DURATION_MINUTES: Record<string, number> = { // 180+30 min intensive 
  short: 45,
  standard: 60,
  intensive: 210,
};

export function isValidSessionType(sessionType: string): boolean {
  return sessionType in DURATION_MINUTES;
}

export function durationMinutes(sessionType: string): number {
  return DURATION_MINUTES[sessionType];
}

export function roomFee(sessionType: string): number {
  return ROOM_FEES[sessionType] ?? 0;
}

export function seatFee(sessionType: string): number {
  return SEAT_FEES[sessionType] ?? 0;
}

export function hoursOfNotice(cancelledAt: Date, startsAt: Date): number {
  return (
    Math.abs(startsAt.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60)
  );
}

// coach cancel
export function coachRefundPercent(hoursNotice: number): number {
  if (hoursNotice >= 96) return 1;
  if (hoursNotice >= 48) return 0.5;
  if (hoursNotice >= 24) return 0.25;
  return 0;
}

//participant cancel
export function participantRefundPercent(hoursNotice: number): number {
  if (hoursNotice >= 24) return 1;
  if (hoursNotice >= 12) return 0.5;
  if (hoursNotice >= 4) return 0.25;
  return 0;
}

//make round for integer --> basically ffloor for money things
export function refundAmount(fee: number, percent: number): number {
  return Math.floor(fee * percent);
}
