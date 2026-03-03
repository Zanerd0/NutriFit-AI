const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const readStateLabel = (state) => {
  switch (state) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
};

router.get("/db", async (_req, res) => {
  const state = mongoose.connection.readyState;

  if (state !== 1) {
    return res.status(503).json({
      ok: false,
      dbState: readStateLabel(state),
      message: "MongoDB is not connected.",
    });
  }

  try {
    await mongoose.connection.db.admin().ping();
    return res.status(200).json({
      ok: true,
      dbState: readStateLabel(state),
      message: "MongoDB connection is healthy.",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      dbState: readStateLabel(state),
      message: "MongoDB connection exists but ping failed.",
      error: error.message,
    });
  }
});

module.exports = router;