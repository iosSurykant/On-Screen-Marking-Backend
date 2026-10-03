import mongoose from "mongoose";

const qaBookletAnswerPdfImageSchema = new mongoose.Schema(
  {
    qaBookletAnswerPdfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QABookletAnswerPdf",
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    page: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "notVisited",
        "visited",
        "completed",
      ],
      default: "notVisited",
    },
  },
  {
    timestamps: true,
  }
);

const QABookletAnswerPdfImage = mongoose.model("QABookletAnswerPdfImage", qaBookletAnswerPdfImageSchema);

export default QABookletAnswerPdfImage;