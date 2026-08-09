"use client";

export type CalendarEvent = {
  id: number;
  starts_at: string;
  label: string;
  detail?: string;
  variant?: "own" | "busy";
};

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const dayMs = 24 * 60 * 60 * 1000;

export function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export default function WeekCalendar({
  events,
  weekStart,
  onWeekChange,
}: {
  events: CalendarEvent[];
  weekStart: Date;
  onWeekChange: (d: Date) => void;
}) {
  const days = [0, 1, 2, 3, 4, 5, 6].map(
    (o) => new Date(weekStart.getTime() + o * dayMs),
  );

  function eventsFor(day: Date, hour: number) {
    return events.filter((e) => {
      const s = new Date(e.starts_at);
      return (
        s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate() &&
        s.getHours() === hour
      );
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          className="btn-secondary"
          onClick={() =>
            onWeekChange(new Date(weekStart.getTime() - 7 * dayMs))
          }
        >
          ← Previous
        </button>
        <span className="text-sm text-gray-500">
          {weekStart.toLocaleDateString()} –{" "}
          {new Date(weekStart.getTime() + 6 * dayMs).toLocaleDateString()}
        </span>
        <button
          className="btn-secondary"
          onClick={() =>
            onWeekChange(new Date(weekStart.getTime() + 7 * dayMs))
          }
        >
          Next →
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="w-14 border-b border-gray-200 bg-gray-50 p-2"></th>
              {days.map((d, i) => (
                <th
                  key={i}
                  className="min-w-[110px] border-b border-gray-200 bg-gray-50 p-2 text-left font-medium"
                >
                  {dayNames[i]} {d.getDate()}/{d.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr key={hour}>
                <th className="border-b border-gray-100 bg-gray-50 p-2 text-left font-normal text-gray-500">
                  {hour}:00
                </th>
                {days.map((d, i) => (
                  <td
                    key={i}
                    className="h-12 border-b border-l border-gray-100 p-1 align-top"
                  >
                    {eventsFor(d, hour).map((e) => (
                      <div
                        key={e.id}
                        title={e.detail}
                        className={`mb-1 truncate rounded px-1.5 py-0.5 ${
                          e.variant === "busy"
                            ? "bg-gray-100 text-gray-500"
                            : "bg-brand-50 text-brand-700"
                        }`}
                      >
                        {e.label}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
