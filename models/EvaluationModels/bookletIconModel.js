import mongoose from "mongoose";

const bookletIconSchema = new mongoose.Schema(
  {
    annotationId: {
      type: String,
      required: true,
      unique: true,
    },

    bookletAnswerPdfImageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookletAnswerPdfImage",
      required: true,
    },

    iconUrl: {
      type: String,
      required: true,
    },

    question: {
      type: String,
      required: true,
    },

    timeStamps: {
      type: String,
      required: true,
    },

    x: { type: String, required: true },
    y: { type: String, required: true },
    width: { type: String, required: true },
    height: { type: String, required: true },

    mark: {
      type: String,
      required: true,
    },

    comment: {
      type: String,
      default: "",
    },

    bookletAnswerPdfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookletAnswerPdf",
      required: true,
    },

    page: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

const BookletIcon = mongoose.model("BookletIcon", bookletIconSchema);

export default BookletIcon;
