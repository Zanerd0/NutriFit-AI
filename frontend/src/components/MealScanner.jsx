/**
 * @file MealScanner.jsx
 * @description Consumer-facing AI meal scanner. Uploads a food photo to
 *              POST /api/vision/scan and displays the estimated calorie count.
 *              Stateless — no save or log functionality.
 */

import { useState, useRef } from "react";
import axios from "../api/axios";
import "./MealScanner.css";

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const MAX_SCAN_ATTEMPTS = 3;
const SCAN_TIMEOUT_MS = 120_000;
const RETRYABLE_STATUSES = new Set([422, 429, 503]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MealScanner = () => {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile]   = useState(null);
  const [previewUrl,   setPreviewUrl]     = useState(null);
  const [isScanning,   setIsScanning]     = useState(false);
  const [scanAttempt,  setScanAttempt]    = useState(0);
  const [estimatedCalories, setEstimatedCalories] = useState(null);
  const [error,        setError]        = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please select a JPEG or PNG image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller.");
      return;
    }

    setError("");
    setEstimatedCalories(null);
    setSelectedFile(file);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const getScanErrorMessage = (err) => {
    const status = err.response?.status;
    const serverMsg = err.response?.data?.error;
    if (serverMsg) return serverMsg;
    if (status === 503) {
      return "The AI service is temporarily busy. Please wait a moment and try again.";
    }
    if (status === 429) {
      return "API quota reached. Wait a minute and try again.";
    }
    return "Failed to scan meal. Please try again.";
  };

  const handleScan = async () => {
    if (!selectedFile) {
      setError("Please choose an image first.");
      return;
    }

    setIsScanning(true);
    setScanAttempt(1);
    setError("");
    setEstimatedCalories(null);

    const formData = new FormData();
    formData.append("image", selectedFile);

    let lastError = "";

    try {
      for (let attempt = 1; attempt <= MAX_SCAN_ATTEMPTS; attempt++) {
        setScanAttempt(attempt);

        if (attempt > 1) {
          await sleep(2000 * (attempt - 1));
        }

        try {
          const res = await axios.post("/vision/scan", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: SCAN_TIMEOUT_MS,
          });
          setEstimatedCalories(res.data.estimatedCalories);
          return;
        } catch (err) {
          lastError = getScanErrorMessage(err);
          const status = err.response?.status;
          const canRetry =
            attempt < MAX_SCAN_ATTEMPTS &&
            (RETRYABLE_STATUSES.has(status) || !status);

          if (!canRetry) break;
        }
      }

      setError(lastError);
    } finally {
      setIsScanning(false);
      setScanAttempt(0);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setEstimatedCalories(null);
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="ms-container">
      <header className="ms-header">
        <div className="ms-header__left">
          <div>
            <h3 className="ms-header__title">AI Meal Scanner</h3>
            <p className="ms-header__subtitle">
              Snap or upload a photo to estimate calories — informational only
            </p>
          </div>
        </div>
        <span className="ms-header__badge">✦ Gemini Vision</span>
      </header>

      <div className="ms-body">
        {!previewUrl ? (
          <label className="ms-upload-zone" htmlFor="meal-scanner-input">
            <span className="ms-upload-zone__title">Choose a meal photo</span>
            <span className="ms-upload-zone__hint">JPEG or PNG · max 5 MB</span>
            <span className="ms-upload-zone__cta">Tap to upload or use camera</span>
          </label>
        ) : (
          <div className="ms-preview">
            <img
              src={previewUrl}
              alt="Selected meal"
              className="ms-preview__image"
            />
          </div>
        )}

        <input
          ref={fileInputRef}
          id="meal-scanner-input"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="ms-file-input"
          onChange={handleFileChange}
        />

        {error && (
          <div className="ms-error" role="alert">
            {error}
          </div>
        )}

        {isScanning && (
          <div className="ms-loading" aria-live="polite">
            <div className="ms-spinner" aria-hidden="true" />
            <span>
              {scanAttempt > 1
                ? `Still analyzing… (attempt ${scanAttempt} of ${MAX_SCAN_ATTEMPTS})`
                : "Estimating calories…"}
            </span>
          </div>
        )}

        {estimatedCalories !== null && !isScanning && (
          <div className="ms-result" role="status">
            <span className="ms-result__label">Estimated</span>
            <span className="ms-result__value">{estimatedCalories}</span>
            <span className="ms-result__unit">Calories</span>
            <p className="ms-result__disclaimer">
              Approximate AI guess from your photo — not a precise nutritional analysis.
              Results can vary; use as a rough guide only.
            </p>
          </div>
        )}

        <div className="ms-actions">
          {!estimatedCalories && (
            <button
              type="button"
              className="ms-btn ms-btn--primary"
              onClick={handleScan}
              disabled={!selectedFile || isScanning}
            >
              {isScanning ? "Scanning…" : "Scan Meal"}
            </button>
          )}

          {previewUrl && !isScanning && (
            <button
              type="button"
              className="ms-btn ms-btn--secondary"
              onClick={handleClear}
            >
              {estimatedCalories !== null ? "Scan Another" : "Clear"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MealScanner;
