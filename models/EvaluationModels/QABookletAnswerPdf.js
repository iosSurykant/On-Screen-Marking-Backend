import mongoose from "mongoose";

const qaBookletAnswerPdfSchema = new mongoose.Schema(
  {
    qaTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QABookletTask",
      required: true,
    },

    bookletAnswerPdfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookletAnswerPdf",
    },

    answerPdfName: {
      type: String,
      required: true,
    },

    assignedDate: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["false", "progress", "true"],
      default: "false",
    },
  },
  {
    timestamps: true,
  },
);

const QABookletAnswerPdf = mongoose.model(
  "QABookletAnswerPdf",
  qaBookletAnswerPdfSchema,
);
export default QABookletAnswerPdf;
