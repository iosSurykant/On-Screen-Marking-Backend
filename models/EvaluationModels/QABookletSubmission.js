import mongoose from "mongoose";

const qaBookletSubmissionSchema = new mongoose.Schema(
  {
    qaTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QABookletTask",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    bookletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QABookletAnswerPdf",
      required: true,
    },

    totalPages: {
      type: Number,
      default: 0,
    },

    passCount: {
      type: Number,
      default: 0,
    },

    failCount: {
      type: Number,
      default: 0,
    },

    submitted: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  },
);

const QABookletSubmission = mongoose.model(
  "QABookletSubmission",
  qaBookletSubmissionSchema,
);

export default QABookletSubmission;
