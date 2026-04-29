import mongoose from "mongoose";

const rejectBookletSchema = new mongoose.Schema(
  {
    questiondefinitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestionDefinition",
      required: true,
    },
    subjectCode: {
      type: String,
      required: true,
    },
    bookletsToAssign: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AnswerPdf",
        required: true,
      },
    ],
  },
  { timestamps: true },
);

const RejectBooklet = mongoose.model("RejectBooklet", rejectBookletSchema);

export default RejectBooklet;
