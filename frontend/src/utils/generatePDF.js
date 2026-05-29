/**
 * @file utils/generatePDF.js
 * @description Universal PDF generator for NutriFit AI premium exports.
 *
 * Supports two plan types — detected automatically from the data shape:
 *   • DietPlan    — weekSchedule { monday…sunday: { breakfast, lunch, dinner } }
 *   • WorkoutPlan — exercises []{ exerciseName, sets, reps }
 *
 * Key design constraints:
 *   ✓ All data is FLATTENED to primitive strings before being passed to autoTable.
 *   ✓ Duration is explicitly excluded from WorkoutPlan output.
 *   ✓ WorkoutPlan uses a single compact summary table (no per-exercise sub-pages).
 *   ✓ Returns { doc, type, filename } — the caller must invoke doc.save().
 *     No automatic download is ever triggered inside this file.
 *
 * Dependencies:
 *   npm install jspdf jspdf-autotable
 */

import { jsPDF }   from "jspdf";
import autoTable   from "jspdf-autotable";

// ─── Page constants ───────────────────────────────────────────────────────────

const PAGE_W      = 210;   // A4 width  mm
const PAGE_H      = 297;   // A4 height mm
const MARGIN      = 14;    // page margin mm (kept tight for compact layout)
const CONTENT_W   = PAGE_W - MARGIN * 2;

// ─── Brand palette (dark-mode tokens → plain RGB arrays) ─────────────────────

const C = {
  primary:   [108,  99, 255], // #6c63ff indigo
  success:   [ 34, 197,  94], // #22c55e green
  surface:   [ 26,  29,  39], // #1a1d27 dark bg
  surface2:  [ 38,  42,  58], // #262a3a slightly lighter
  text:      [220, 224, 235], // #dce0eb light text
  muted:     [107, 114, 128], // #6b7280 grey
  white:     [255, 255, 255],
  black:     [  0,   0,   0],
  danger:    [239,  68,  68], // #ef4444
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Coerce any value to a display-safe string.
 * Returns "—" for null / undefined / empty; never returns an object or array.
 */
function str(val, fallback = "—") {
  if (val === null || val === undefined || val === "") return fallback;
  if (typeof val === "object")                          return fallback; // never leak objects
  return String(val);
}

/** Truncate a string to maxLen characters, appending "…" if needed. */
function trunc(val, maxLen) {
  const s = str(val);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

/**
 * Detect plan type from the document shape.
 * @returns {"diet" | "workout" | "unknown"}
 */
function detectType(planData) {
  if (!planData || typeof planData !== "object") return "unknown";
  if (planData.weekSchedule && typeof planData.weekSchedule === "object") return "diet";
  if (Array.isArray(planData.exercises))                                   return "workout";
  return "unknown";
}

// ─── Shared header / footer helpers ──────────────────────────────────────────

/**
 * Draw the branded header bar at the top of the current page.
 */
function drawHeader(doc, titleLine1, titleLine2, accentColor) {
  // Background rect
  doc.setFillColor(...C.surface2);
  doc.roundedRect(MARGIN, 8, CONTENT_W, 26, 3, 3, "F");

  // Left accent stripe
  doc.setFillColor(...accentColor);
  doc.roundedRect(MARGIN, 8, 4, 26, 2, 2, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.white);
  doc.text(titleLine1, MARGIN + 9, 18);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.muted);
  doc.text(titleLine2, MARGIN + 9, 25);

  // Brand watermark — pulled 2 mm inward from the rect edge to avoid clipping
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...accentColor);
  doc.text("NutriFit AI", PAGE_W - MARGIN - 2, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text("Premium Export", PAGE_W - MARGIN - 2, 23, { align: "right" });
}

/**
 * Stamp a footer line + page numbers on every page after content is built.
 */
function drawFooters(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.muted);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 10, PAGE_W - MARGIN, PAGE_H - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(
      "NutriFit AI — Confidential & Personalised",
      MARGIN,
      PAGE_H - 6
    );
    doc.text(
      `Page ${i} of ${total}  |  ${new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
      })}`,
      PAGE_W - MARGIN,
      PAGE_H - 6,
      { align: "right" }
    );
  }
}

// ─── DietPlan builder ─────────────────────────────────────────────────────────

const DAYS_ORDER = [
  "monday", "tuesday", "wednesday", "thursday",
  "friday",  "saturday", "sunday",
];
const DAY_LABEL = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

function buildDietPDF(doc, planData) {
  const { weekSchedule, title, generatedAt, createdAt } = planData;

  const planTitle = str(title, "My AI-Generated Diet Plan");
  const dateStr   = (generatedAt || createdAt)
    ? new Date(generatedAt || createdAt).toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      });

  // ── Render each day — Monday starts on page 1, rest get their own page ──────
  DAYS_ORDER.forEach((day, idx) => {
    const meals = (weekSchedule && weekSchedule[day]) || {};
    if (!meals.breakfast && !meals.lunch && !meals.dinner) return;

    // Page 1: Monday uses the existing blank page. All other days get a new page.
    if (idx > 0) doc.addPage();

    drawHeader(doc, str(DAY_LABEL[day]), `${planTitle} — Generated: ${dateStr}`, C.primary);

    const entries = [
      { label: "Breakfast", text: str(meals.breakfast), color: [245, 158, 11]  },
      { label: "Lunch",     text: str(meals.lunch),     color: [16, 185, 129]  },
      { label: "Dinner",    text: str(meals.dinner),    color: [139,  92, 246] },
    ];

    let curY = 40;
    entries.forEach(({ label, text, color }) => {
      if (text === "—") return;

      // ── Overflow guard: check BEFORE drawing so nothing starts off-page ──
      if (curY > PAGE_H - 60) {
        doc.addPage();
        drawHeader(doc, str(DAY_LABEL[day]), `${planTitle} — continued`, C.primary);
        curY = 40;
      }

      // Meal type label badge
      doc.setFillColor(...color);
      doc.roundedRect(MARGIN, curY, CONTENT_W, 6.5, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.black);
      doc.text(label.toUpperCase(), MARGIN + 4, curY + 4.5);
      curY += 8;

      // Meal text content block
      // CRITICAL: set font BEFORE splitTextToSize so line-breaking uses the
      // correct glyph widths at 8.5pt (not the 7.5pt label font above).
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);

      const TEXT_W = CONTENT_W - 18; // 9 mm padding each side
      const lines  = doc.splitTextToSize(text, TEXT_W);

      // jsPDF line height at 8.5pt ≈ 8.5 * 0.3528 * 1.15 ≈ 3.45 mm.
      // Use 5 mm per line to guarantee the text never clips the block bottom.
      const LINE_H = 5;
      const blockH = lines.length * LINE_H + 10; // 5mm top + 5mm bottom padding

      doc.setFillColor(...C.surface);
      doc.roundedRect(MARGIN, curY, CONTENT_W, blockH, 1.5, 1.5, "F");
      doc.setTextColor(...C.text);
      doc.text(lines, MARGIN + 9, curY + 6); // left-inset matches TEXT_W padding
      curY += blockH + 6;
    });
  });

  // ── Disclaimer page ─────────────────────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, "Important Disclaimer", "Please read before following this plan", C.danger);

  const disclaimerLines = [
    "This diet plan was generated by an Artificial Intelligence model based on the health",
    "profile information you provided. It is a general nutritional guideline ONLY and does",
    "NOT constitute professional medical or dietary advice.",
    "",
    "Before making significant dietary changes you should:",
    "  \u2022 Consult a licensed dietician or nutritionist.",
    "  \u2022 Inform your doctor if you have existing medical conditions.",
    "  \u2022 Not use this plan as a substitute for professional healthcare advice.",
    "",
    "NutriFit AI accepts no liability for adverse effects arising from following this plan",
    "without appropriate professional supervision.",
  ];
  let dy = 42;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.text);
  disclaimerLines.forEach((line) => {
    doc.text(line, MARGIN, dy);
    dy += line === "" ? 3.5 : 5.5;
  });
}

// ─── WorkoutPlan builder ──────────────────────────────────────────────────────

function buildWorkoutPDF(doc, planData) {
  const {
    title,
    description,
    exercises = [],
    createdAt,
    instructorId,
  } = planData;

  const planTitle      = str(title,       "My Workout Plan");
  const planDesc       = str(description, "");
  const instructorName = str(instructorId?.full_name, null);
  const dateStr        = createdAt
    ? new Date(createdAt).toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      });

  // ── Header ────────────────────────────────────────────────────────────────
  drawHeader(doc, planTitle, `Assigned: ${dateStr}`, C.success);

  let curY = 38;

  // Optional description + instructor meta
  if (planDesc && planDesc !== "—") {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    const descLines = doc.splitTextToSize(planDesc, CONTENT_W);
    doc.text(descLines, MARGIN, curY);
    curY += descLines.length * 4 + 2;
  }

  if (instructorName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.success);
    doc.text(`Instructor: ${instructorName}`, MARGIN, curY);
    curY += 6;
  }

  // ── FLATTEN: Extract only primitive strings ─────────────────────────────────
  const formatWorkoutTarget = (ex) => {
    switch (ex?.metricType) {
      case "sets_time": return `${str(ex.sets)} × ${str(ex.durationSecs)}s`;
      case "distance":  return `${str(ex.distanceValue)} ${ex.distanceUnit || "km"}`;
      case "time":      return `${str(ex.timeMinutes)} min`;
      case "laps":      return `${str(ex.laps)} laps`;
      case "custom":    return trunc(str(ex.customMetric), 40);
      default:          return `${str(ex?.sets)} × ${str(ex?.reps)}`;
    }
  };

  const tableRows = (Array.isArray(exercises) ? exercises : []).map((ex, idx) => {
    const num    = String(idx + 1);
    const name   = trunc(str(ex?.exerciseName), 50);
    const target = formatWorkoutTarget(ex);
    return [num, name, target];
  });

  if (tableRows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text("No exercises have been added to this plan yet.", MARGIN, curY + 6);
    return;
  }

  // ── Single compact summary table ─────────────────────────────────────────
  autoTable(doc, {
    startY: curY,
    head:   [["#", "Exercise", "Target"]],
    body:   tableRows,

    // ── Compact sizing ──────────────────────────────────────────────────────
    margin: { left: MARGIN, right: MARGIN },
    theme:  "plain",
    styles: {
      font:        "helvetica",
      fontSize:    8,                   // tight — fits more rows per page
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      overflow:    "linebreak",
      lineColor:   C.surface2,
      lineWidth:   0.25,
      textColor:   C.text,
      fillColor:   C.surface,
      minCellHeight: 0,                 // allow rows to collapse to content height
    },
    headStyles: {
      fillColor:  C.success,
      textColor:  C.black,
      fontStyle:  "bold",
      fontSize:   8.5,
    },
    alternateRowStyles: { fillColor: C.surface2 },
    columnStyles: {
      0: { cellWidth: 10,  halign: "center", fontStyle: "bold", textColor: C.success },
      1: { cellWidth: "auto"                                                          },
      2: { cellWidth: 36,  halign: "center"                                          },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(doc, planTitle, `Assigned: ${dateStr} — continued`, C.success);
      }
    },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * generatePDF — Build a branded PDF for a DietPlan or WorkoutPlan document.
 *
 * The function detects the plan type automatically. It returns the jsPDF
 * document instance — the caller is responsible for triggering the download:
 *
 *   const { doc, filename } = generatePDF(plan);
 *   doc.save(`${filename}.pdf`);             // trigger download
 *   // or: doc.output("blob")               // get Blob for upload / preview
 *
 * @param  {object} planData  — Raw plan document from the API.
 * @param  {object} [options]
 * @param  {string} [options.filename] — Optional override for the suggested filename.
 * @returns {{ doc: jsPDF, type: "diet"|"workout"|"unknown", filename: string }}
 * @throws {Error} if the plan type cannot be determined.
 */
export function generatePDF(planData, options = {}) {
  const type = detectType(planData);

  if (type === "unknown") {
    throw new Error(
      "generatePDF: Cannot detect plan type. " +
      "Ensure planData has a `weekSchedule` (DietPlan) or `exercises` array (WorkoutPlan)."
    );
  }

  // A4 portrait
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  if (type === "diet") {
    buildDietPDF(doc, planData);
  } else {
    buildWorkoutPDF(doc, planData);
  }

  // Stamp footers on every page now that all content is committed
  drawFooters(doc);

  // Derive a safe filename from the plan title
  const rawName  = str(planData?.title, type === "diet" ? "Diet-Plan" : "Workout-Plan");
  const safeName = rawName
    .replace(/[^a-z0-9 _-]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const filename = options.filename ?? `NutriFit-AI_${safeName}`;

  return { doc, type, filename };
}
