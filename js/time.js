// Game clock. All simulation time is measured in "game seconds" that map 1:1 to real
// seconds of play. One in-game day is 20 real minutes, so one in-game hour is 50 seconds.
// Daylight lasts 14 minutes (05:00 - 21:48) and night 6 minutes (21:48 - 05:00).

export const DAY_SECONDS = 20 * 60;
export const HOUR_SECONDS = DAY_SECONDS / 24;
export const SUNRISE_HOUR = 5;
export const DAYLIGHT_HOURS = (14 / 20) * 24;
export const START_CLOCK = 6 * HOUR_SECONDS; // the game begins at 06:00 on day 1
export const DAYS_PER_SEASON = 5;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const dayNumber = clock => Math.floor(clock / DAY_SECONDS) + 1;
export const hourOfDay = clock => (clock % DAY_SECONDS) / HOUR_SECONDS;
export const isDaytime = clock => {
  const hour = hourOfDay(clock);
  return hour >= SUNRISE_HOUR && hour < SUNRISE_HOUR + DAYLIGHT_HOURS;
};
export const seasonIndex = clock => Math.floor((dayNumber(clock) - 1) / DAYS_PER_SEASON) % SEASONS.length;
export const seasonName = clock => SEASONS[seasonIndex(clock)];
export const formatClock = clock => {
  const hour = hourOfDay(clock);
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Working schedules. `start`/`end` are in-game hours; an end earlier than the start wraps past midnight.
export const SCHEDULES = {
  day:   { id: 'day',   name: 'Day shift (08-17)',   start: 8,  end: 17, hours: 9 },
  long:  { id: 'long',  name: 'Long day (07-19)',    start: 7,  end: 19, hours: 12 },
  night: { id: 'night', name: 'Night watch (22-06)', start: 22, end: 6,  hours: 8 }
};

export function isWorking(scheduleId, hour) {
  const s = SCHEDULES[scheduleId] || SCHEDULES.day;
  return s.start < s.end ? hour >= s.start && hour < s.end : hour >= s.start || hour < s.end;
}

// The default daily routine, used for display and happiness (rest) rules.
export const ROUTINE = [
  [6, 8, 'Waking up and breakfast'],
  [8, 17, 'At work'],
  [17, 19, 'Resting'],
  [19, 22, 'Dinner and company'],
  [22, 30, 'Asleep']
];

export function activityAt(hour) {
  const h = hour < 6 ? hour + 24 : hour;
  const slot = ROUTINE.find(([from, to]) => h >= from && h < to);
  return slot ? slot[2] : 'Asleep';
}
