import mongoose from "mongoose";

const bookletTaskSchema = new mongoose.Schema(
  {
    subjectCode: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalBooklets: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["inactive", "active", "paused", "success"],
      default: "inactive",
    },
    currentFileIndex: {
      type: Number,
      default: 1,
    },
    startTime: {
      type: Date,
      default: null,
    },
    remainingTimeInSec: {
      type: Number,
      default: null,
    },
    lastResumedAt: {
      type: Date,
      default: null,
    },
    taskType: {
      type: String,
      enum: ["booklet"],
      default: "booklet",
    },
    efficiency: {
      type: [Number],
      default: [],
    },
  },
  { timestamps: true },
);

const BookletTask = mongoose.model("BookletTask", bookletTaskSchema);

export default BookletTask;
