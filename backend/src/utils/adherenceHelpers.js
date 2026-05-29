/**
 * @file adherenceHelpers.js
 * @description Shared helpers for per-day diet/workout adherence checklists.
 */

const TODAY_MEAL_KEYS = ["breakfast", "lunch", "dinner"];

const formatDateKey = (input = new Date()) => {
  const d = input instanceof Date ? input : new Date(`${input}T12:00:00`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const addDays = (input, delta) => {
  const d = input instanceof Date ? new Date(input) : new Date(`${input}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d;
};

const getWeekdayKey = (dateKey) => {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
};

const mergeByKey = (prevItems = [], nextItems = []) => {
  const prevByKey = new Map((prevItems || []).map((i) => [i.key, i]));
  return nextItems.map((item) => ({
    ...item,
    completed: prevByKey.get(item.key)?.completed || false,
  }));
};

const makeDietItemsFromPlan = (plan, dateKey) => {
  if (!plan) return { items: [], signature: "" };
  const todayKey = getWeekdayKey(dateKey);
  const todayMeals = plan.weekSchedule?.[todayKey] || {};
  const items = TODAY_MEAL_KEYS.map((k) => ({
    key: k,
    label: `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${todayMeals[k] || "No meal set"}`,
    completed: false,
  }));
  const signature = `${plan._id}:${todayKey}:${items.map((x) => x.label).join("|")}`;
  return { items, signature };
};

const makeWorkoutItemsFromPlan = (plan) => {
  if (!plan) return { items: [], signature: "" };
  const items = (plan.exercises || []).map((ex, idx) => ({
    key: `ex-${idx}-${(ex.exerciseName || "").trim().toLowerCase()}`,
    label: ex.exerciseName || `Exercise ${idx + 1}`,
    completed: false,
  }));
  const signature = `${plan._id}:${items.map((x) => x.key).join("|")}`;
  return { items, signature };
};

const migrateLegacyBlock = (block) => {
  if (!block) {
    return { planId: null, sourceSignature: "", entries: [], updatedAt: null };
  }
  if (!Array.isArray(block.entries)) {
    block.entries = [];
  }
  if ((block.items || []).length > 0 && block.entries.length === 0) {
    block.entries.push({
      date: formatDateKey(new Date()),
      items: block.items,
    });
  }
  delete block.items;
  return block;
};

const getEntryForDate = (block, dateKey) => {
  migrateLegacyBlock(block);
  return (block.entries || []).find((e) => e.date === dateKey) || null;
};

const upsertEntryForDate = (block, dateKey, items) => {
  migrateLegacyBlock(block);
  const idx = block.entries.findIndex((e) => e.date === dateKey);
  if (idx === -1) {
    block.entries.push({ date: dateKey, items });
  } else {
    block.entries[idx].items = items;
  }
  block.updatedAt = new Date();
  return block;
};

const isDayFullyFollowed = (items) =>
  Array.isArray(items) && items.length > 0 && items.every((i) => i.completed);

/**
 * Green if client completed all checklist items on each of the previous 2 calendar days.
 */
const computeTwoDayAdherenceFlag = (block, type, plan) => {
  if (!plan) return "red";
  migrateLegacyBlock(block);

  const day1 = formatDateKey(addDays(new Date(), -1));
  const day2 = formatDateKey(addDays(new Date(), -2));

  for (const dateKey of [day1, day2]) {
    const built =
      type === "diet"
        ? makeDietItemsFromPlan(plan, dateKey)
        : makeWorkoutItemsFromPlan(plan);

    if (!built.items.length) return "red";

    const entry = getEntryForDate(block, dateKey);
    const merged = mergeByKey(entry?.items, built.items);
    if (!isDayFullyFollowed(merged)) return "red";
  }

  return "green";
};

const syncBlockForDate = (block, type, plan, dateKey) => {
  let changed = false;
  const migrated = migrateLegacyBlock(block || {});

  if (!plan) {
    return { block: migrated, payload: { planId: null, date: dateKey, items: [] }, changed };
  }

  const built =
    type === "diet"
      ? makeDietItemsFromPlan(plan, dateKey)
      : makeWorkoutItemsFromPlan(plan);

  const planChanged = String(migrated.planId || "") !== String(plan._id);
  const signatureChanged =
    type === "workout" && migrated.sourceSignature !== built.signature;

  if (planChanged || signatureChanged) {
    migrated.planId = plan._id;
    if (type === "workout") migrated.sourceSignature = built.signature;
    changed = true;
  }

  const entry = getEntryForDate(migrated, dateKey);
  const mergedItems = mergeByKey(entry?.items, built.items);

  if (!entry || JSON.stringify(entry.items) !== JSON.stringify(mergedItems)) {
    upsertEntryForDate(migrated, dateKey, mergedItems);
    changed = true;
  }

  return {
    block: migrated,
    payload: { planId: plan._id, date: dateKey, items: mergedItems },
    changed,
  };
};

module.exports = {
  TODAY_MEAL_KEYS,
  formatDateKey,
  addDays,
  getWeekdayKey,
  mergeByKey,
  makeDietItemsFromPlan,
  makeWorkoutItemsFromPlan,
  migrateLegacyBlock,
  getEntryForDate,
  upsertEntryForDate,
  isDayFullyFollowed,
  computeTwoDayAdherenceFlag,
  syncBlockForDate,
};
