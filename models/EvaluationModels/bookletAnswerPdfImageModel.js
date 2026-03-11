import mongoose from "mongoose";

const bookletAnswerPdfImageSchema = new mongoose.Schema(
  {
    bookletAnswerPdfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookletAnswerPdf",
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
      default: "notVisited",
    },
  },
  { timestamps: true },
);

const BookletAnswerPdfImage = mongoose.model(
  "BookletAnswerPdfImage",
  bookletAnswerPdfImageSchema,
);

export default BookletAnswerPdfImage;
