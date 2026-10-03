import mongoose from "mongoose";

const headMarksSchema = new mongoose.Schema(
  {
    answerPdfId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    questionDefinitionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    headEvaluatorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    allottedMarks: {
      type: Number,
      default: 0,
    },
    timerStamps: String,
    isMarked: Boolean,
  },
  { timestamps: true },
);

export default mongoose.model("HeadMarks", headMarksSchema);
