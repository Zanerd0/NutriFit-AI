/**
 * @file visionRoutes.js
 * @description Express router for the AI Meal Scanner (Computer Vision) endpoint.
 *
 * Endpoints:
 *   POST /scan  →  visionController.scanMeal
 *                  Accepts a multipart image upload and returns estimated calories.
 *
 * Mount point in index.js:
 *   app.use("/api/vision", visionRoutes);
 *
 * Full endpoint URL: POST http://localhost:5000/api/vision/scan
 *
 * Expected request: multipart/form-data with field name "image" (JPEG or PNG, max 5 MB)
 *
 * Success response (200):
 *   { "estimatedCalories": 450 }
 */

const express = require("express");
const multer  = require("multer");
const { scanMeal } = require("../controllers/visionController");
const verifyToken = require("../middleware/verifyToken");
const isConsumer  = require("../middleware/isConsumer");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed."));
    }
  },
});

const handleMulterError = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Image must be 5 MB or smaller." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

router.post(
  "/scan",
  verifyToken,
  isConsumer,
  upload.single("image"),
  handleMulterError,
  scanMeal
);

module.exports = router;
