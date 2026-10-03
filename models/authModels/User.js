import mongoose from "mongoose";

/* -------------------------------------------------------------------------- */
/*                           USER   SCHEMA                                    */
/* -------------------------------------------------------------------------- */

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    default: null,
  },
  fingerprint: {
    type: String,
    default: null,
  },
  mobile: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
  subjectCode: {
    type: [String],
    require: false,
  },
  maxBooklets: {
    type: Number,
    required: false,
  },
  limitType: {
    type: String,
    enum: ["perDay", "total", ""],
    required: function () {
      return this.role === "evaluator";
    },
  },
  deputyHead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  evaluators: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  efficiency: {
    type: [Number],
    default: [],
  },
  permissions: {
    type: Array,
    default: [],
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", UserSchema);
export default User;
