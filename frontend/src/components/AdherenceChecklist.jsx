/**
 * @file AdherenceChecklist.jsx
 * @description Collapsible date picker + per-day adherence checklist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./AdherenceChecklist.css";

export const formatDateKey = (input = new Date()) => {
  const d = input instanceof Date ? input : new Date(`${input}T12:00:00`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseDateKey = (dateKey) => new Date(`${dateKey}T12:00:00`);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const AdherenceChecklist = ({ type, planId, enabled, title, subtitle }) => {
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calOpen, setCalOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDateKey(todayKey);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const calWrapRef = useRef(null);

  const fetchForDate = useCallback(
    async (dateKey) => {
      if (!enabled || !planId) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/consumer/adherence?date=${dateKey}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setItems([]);
          return;
        }
        const block = data?.[type];
        if (String(block?.planId || "") !== String(planId)) {
          setItems([]);
          return;
        }
        setItems(Array.isArray(block?.items) ? block.items : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [enabled, planId, type]
  );

  useEffect(() => {
    fetchForDate(selectedDate);
  }, [selectedDate, fetchForDate]);

  useEffect(() => {
    if (!calOpen) return undefined;
    const onDocClick = (e) => {
      if (calWrapRef.current && !calWrapRef.current.contains(e.target)) {
        setCalOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [calOpen]);

  const toggleItem = async (item) => {
    const next = !item.completed;
    setItems((prev) =>
      prev.map((it) => (it.key === item.key ? { ...it, completed: next } : it))
    );
    try {
      await fetch(`/api/consumer/adherence/${type}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: item.key,
          completed: next,
          date: selectedDate,
        }),
      });
    } catch {
      setItems((prev) =>
        prev.map((it) => (it.key === item.key ? { ...it, completed: item.completed } : it))
      );
    }
  };

  const calendarCells = useMemo(() => {
    const first = new Date(viewMonth.year, viewMonth.month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        day,
        dateKey: formatDateKey(new Date(viewMonth.year, viewMonth.month, day)),
      });
    }
    return cells;
  }, [viewMonth]);

  const goMonth = (delta) => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectDate = (dateKey) => {
    if (dateKey > todayKey) return;
    setSelectedDate(dateKey);
    setCalOpen(false);
    const d = parseDateKey(dateKey);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const triggerLabel = parseDateKey(selectedDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: selectedDate === todayKey ? undefined : "numeric",
  });

  const isToday = selectedDate === todayKey;

  if (!enabled) return null;

  return (
    <div className="adh" id={`adh-${type}-checklist`}>
      <h3 className="adh__title">{title}</h3>
      <p className="adh__sub">{subtitle}</p>

      <div className="adh-date-row" ref={calWrapRef}>
        <button
          type="button"
          className={`adh-date-trigger ${calOpen ? "adh-date-trigger--open" : ""}`}
          onClick={() => setCalOpen((v) => !v)}
          aria-expanded={calOpen}
          aria-haspopup="dialog"
        >
          <span className="adh-date-trigger__icon" aria-hidden="true">📅</span>
          <span>
            {isToday ? "Today" : triggerLabel}
            <span className="adh-date-trigger__sub">
              {isToday ? triggerLabel : "Selected date"}
            </span>
          </span>
          <span className="adh-date-trigger__chev" aria-hidden="true">{calOpen ? "▴" : "▾"}</span>
        </button>

        {calOpen && (
          <div className="adh-cal adh-cal--popover" role="dialog" aria-label="Choose date">
            <div className="adh-cal__header">
              <button type="button" className="adh-cal__nav" onClick={() => goMonth(-1)} aria-label="Previous month">
                ‹
              </button>
              <span className="adh-cal__month">
                {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
              </span>
              <button
                type="button"
                className="adh-cal__nav"
                onClick={() => goMonth(1)}
                aria-label="Next month"
                disabled={
                  viewMonth.year > new Date().getFullYear() ||
                  (viewMonth.year === new Date().getFullYear() &&
                    viewMonth.month >= new Date().getMonth())
                }
              >
                ›
              </button>
            </div>
            <div className="adh-cal__weekdays">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`} className="adh-cal__weekday">{w}</span>
              ))}
            </div>
            <div className="adh-cal__grid">
              {calendarCells.map((cell, i) =>
                cell ? (
                  <button
                    key={cell.dateKey}
                    type="button"
                    className={[
                      "adh-cal__day",
                      cell.dateKey === selectedDate ? "adh-cal__day--selected" : "",
                      cell.dateKey === todayKey ? "adh-cal__day--today" : "",
                      cell.dateKey > todayKey ? "adh-cal__day--disabled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => selectDate(cell.dateKey)}
                    disabled={cell.dateKey > todayKey}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={`pad-${i}`} className="adh-cal__pad" />
                )
              )}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="adh__empty">Loading checklist…</p>
      ) : items.length > 0 ? (
        <div className="adh__list">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`adh-item ${item.completed ? "adh-item--yes" : "adh-item--no"}`}
              onClick={() => toggleItem(item)}
            >
              <span className="adh-item__icon">{item.completed ? "✔" : "✕"}</span>
              <span className="adh-item__label">{item.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="adh__empty">No checklist items for this date yet.</p>
      )}
    </div>
  );
};

export default AdherenceChecklist;
