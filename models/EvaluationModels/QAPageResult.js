import mongoose from "mongoose";

const qaPageResultSchema = new mongoose.Schema(
  {
    qaSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QABookletSubmission",
      required: true,
    },

    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QABookletAnswerPdfImage",
      required: true,
    },

    pageNumber: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["ok", "not_ok"],
      default: "ok",
    },
  },
  {
    timestamps: true,
  }
);

const QAPageResult = mongoose.model(
  "QAPageResult",
  qaPageResultSchema
);

export default QAPageResult;