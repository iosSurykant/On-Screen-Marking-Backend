import mongoose from "mongoose";

const qaBookletTaskSchema = new mongoose.Schema(
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

    percentage: {
      type: Number,
      required: true,
    },

    totalBooklets: {
      type: Number,
      default: 0,
    },

    currentFileIndex: {
      type: Number,
      default: 1,
    },

    status: {
      type: String,
      enum: ["inactive", "active", "success"],
      default: "inactive",
    },

    taskType: {
      type: String,
      enum: ["booklet"],
      default: "booklet",
    },
  },
  {
    timestamps: true,
  },
);

const QABookletTask = mongoose.model("QABookletTask", qaBookletTaskSchema);

export default QABookletTask;
