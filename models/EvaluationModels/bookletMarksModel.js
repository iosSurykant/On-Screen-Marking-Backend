import mongoose from "mongoose";

const bookletMarksSchema = new mongoose.Schema(
  {
    bookletAnswerPdfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookletAnswerPdf",
      required: true,
    },

    questionLabel: {
      type: String, // since booklet-wise has no questionDefinitionId
      required: true,
    },

    allottedMarks: {
      type: Number,
      required: true,
    },

    timerStamps: {
      type: String,
      default: "",
    },

    isMarked: {
      type: Boolean,
      default: false,
    },

    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

const BookletMarks = mongoose.model("BookletMarks", bookletMarksSchema);

export default BookletMarks;
