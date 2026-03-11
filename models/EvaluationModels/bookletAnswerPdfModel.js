import mongoose from "mongoose";

const bookletAnswerPdfSchema = new mongoose.Schema(
  {
    bookletTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookletTask",
      required: true,
    },
    answerPdfName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["false", "progress", "true", "reject"],
      default: "false",
    },
    assignedDate: {
      type: Date,
      required: true,
      index: true,
    },
    rejectionReason: String,
    rejectedAt: Date,
  },
  { timestamps: true },
);

const BookletAnswerPdf = mongoose.model(
  "BookletAnswerPdf",
  bookletAnswerPdfSchema,
);

export default BookletAnswerPdf;
