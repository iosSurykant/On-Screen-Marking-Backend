import User from "../models/authModels/User.js";
import Task from "../models/taskModels/taskModel.js";
import Courses from "../models/classModel/classModel.js";
import Subject from "../models/classModel/subjectModel.js";
import Schema from "../models/schemeModel/schema.js";
import answerPdf from "../models/EvaluationModels/studentAnswerPdf.js";

import BookletTask from "../models/taskModels/bookletTaskModel.js";
import BookletAnswerPdf from "../models/EvaluationModels/bookletAnswerPdfModel.js";

import ReviewerTask from "../models/taskModels/reviewerTaskModel.js";

import mongoose from "mongoose";

export default function handleAnalyticsSocket(io) {
  const ADMIN_ANALYTICS_ROOM = "admin-analytics";

  io.on("connection", (socket) => {
    console.log("🟢 Client connected for analytics:", socket.id);

    let adminInterval = null;
    let evaluatorInterval = null;

    // ===============================
    // ADMIN ANALYTICS
    // ===============================
    socket.on("join-analytics-room", async () => {
      socket.join(ADMIN_ANALYTICS_ROOM);
      console.log(`🟢 ${socket.id} joined ${ADMIN_ANALYTICS_ROOM}`);

      try {
        const analytics = await fetchAdminAnalytics();
        socket.emit("admin-analytics-data", analytics);
      } catch (err) {
        socket.emit("admin-analytics-error", {
          message: "Failed to fetch admin analytics",
        });
      }

      // 🔄 Auto refresh (30s)
      if (!adminInterval) {
        adminInterval = setInterval(async () => {
          try {
            const analytics = await fetchAdminAnalytics();
            io.to(ADMIN_ANALYTICS_ROOM).emit("admin-analytics-data", analytics);
          } catch (err) {
            console.error("❌ Admin auto-refresh error:", err);
          }
        }, 30000);
      }
    });

    socket.on("get-admin-analytics", async () => {
      try {
        const analytics = await fetchAdminAnalytics();
        io.to(ADMIN_ANALYTICS_ROOM).emit("admin-analytics-data", analytics);
      } catch (err) {
        socket.emit("admin-analytics-error", {
          message: "Failed to fetch admin analytics",
        });
      }
    });

    // ===============================
    // EVALUATOR ANALYTICS
    // ===============================
    socket.on("join-evaluatorAnalytics-room", async ({ userId }) => {
      console.log("userId in evaluator analytics socket:", userId);

      if (!userId) return;

      const room = `evaluator-analytics:${userId}`;
      socket.join(room);
      console.log(`🟢 ${socket.id} joined ${room}`);

      try {
        const analytics = await getEvaluatorAnalytics(userId);
        socket.emit("evaluator-analytics-data", analytics);
      } catch (err) {
        socket.emit("evaluator-analytics-error", {
          message: "Failed to fetch evaluator analytics",
        });
      }

      // 🔄 Auto refresh (30s)
      evaluatorInterval = setInterval(async () => {
        try {
          const analytics = await getEvaluatorAnalytics(userId);
          io.to(room).emit("evaluator-analytics-data", analytics);
        } catch (err) {
          console.error("❌ Evaluator auto-refresh error:", err);
        }
      }, 30000);
    });

    socket.on("get-evaluator-analytics", async ({ userId }) => {
      if (!userId) return;

      const room = `evaluator-analytics:${userId}`;
      try {
        const analytics = await getEvaluatorAnalytics(userId);
        io.to(room).emit("evaluator-analytics-data", analytics);
      } catch (err) {
        socket.emit("evaluator-analytics-error", {
          message: "Failed to fetch evaluator analytics",
        });
      }
    });

    let reviewerInterval = null;

    // ===============================
    // REVIEWER ANALYTICS
    // ===============================
    socket.on("join-reviewerAnalytics-room", async ({ userId }) => {
      if (!userId) return;

      const room = `reviewer-analytics:${userId}`;
      socket.join(room);
      console.log(`🟢 ${socket.id} joined ${room}`);

      try {
        const analytics = await getReviewerAnalytics(userId);
        socket.emit("reviewer-analytics-data", analytics);
      } catch (err) {
        socket.emit("reviewer-analytics-error", {
          message: "Failed to fetch reviewer analytics",
        });
      }

      reviewerInterval = setInterval(async () => {
        try {
          const analytics = await getReviewerAnalytics(userId);
          io.to(room).emit("reviewer-analytics-data", analytics);
        } catch (err) {
          console.error("❌ Reviewer auto-refresh error:", err);
        }
      }, 30000);
    });

    let principalInterval = null;

    // ===============================
    // PRINCIPAL ANALYTICS
    // ===============================
    socket.on("join-principalAnalytics-room", async () => {
      const room = "principal-analytics";
      socket.join(room);
      console.log(`🟢 ${socket.id} joined ${room}`);

      try {
        const analytics = await getPrincipalAnalytics();
        socket.emit("principal-analytics-data", analytics);
      } catch (err) {
        socket.emit("principal-analytics-error", {
          message: "Failed to fetch principal analytics",
        });
      }

      principalInterval = setInterval(async () => {
        try {
          const analytics = await getPrincipalAnalytics();
          io.to(room).emit("principal-analytics-data", analytics);
        } catch (err) {
          console.error("❌ Principal auto-refresh error:", err);
        }
      }, 30000);
    });

    // ===============================
    // CLEANUP
    // ===============================
    socket.on("disconnect", () => {
      if (adminInterval) clearInterval(adminInterval);
      if (evaluatorInterval) clearInterval(evaluatorInterval);
      if (reviewerInterval) clearInterval(reviewerInterval);
      if (principalInterval) clearInterval(principalInterval);
      console.log("🔴 Client disconnected:", socket.id);
    });
  });
}

// ===============================
// ANALYTICS CALCULATION
// ===============================
async function fetchAdminAnalytics() {
  const [
    totalUsers,
    totalEvaluators,
    totalAdmins,
    tasks,
    completedTasks,
    pendingTasks,
    courses,
    subjects,
    schemas,
    totalResultGenerated,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "evaluator" }),
    User.countDocuments({ role: "admin" }),
    Task.countDocuments({}),
    Task.countDocuments({ status: "completed" }),
    Task.countDocuments({ status: "pending" }),
    Courses.countDocuments({}),
    Subject.countDocuments({}),
    Schema.countDocuments({}),
    answerPdf.countDocuments({ status: true }),
  ]);

  return {
    totalUsers,
    totalEvaluators,
    totalAdmins,
    tasks,
    completedTasks,
    pendingTasks,
    courses,
    subjects,
    schemas,
    totalResultGenerated,
  };
}

export async function getEvaluatorAnalytics(userId) {
  try {
    console.log("🔥 NEW ANALYTICS FUNCTION RUNNING");
    const evaluatorId = new mongoose.Types.ObjectId(userId);

    /* ===============================
       QUESTION BOOKLET COUNTS
    =============================== */

    const questionAgg = await Task.aggregate([
      { $match: { userId: evaluatorId } },
      {
        $lookup: {
          from: "answerpdfs",
          localField: "_id",
          foreignField: "taskId",
          as: "pdfs",
        },
      },
      { $unwind: "$pdfs" },
      {
        $group: {
          _id: "$pdfs.status",
          count: { $sum: 1 },
        },
      },
    ]);

    let questionNotStarted = 0;
    let questionPending = 0;

    questionAgg.forEach((item) => {
      if (item._id === "false") questionNotStarted = item.count;
      if (item._id === "progress") questionPending = item.count;
    });

    /* ===============================
       BOOKLET BOOKLET COUNTS
    =============================== */

    const bookletAgg = await BookletTask.aggregate([
      { $match: { userId: evaluatorId } },
      {
        $lookup: {
          from: "bookletanswerpdfs",
          localField: "_id",
          foreignField: "bookletTaskId",
          as: "pdfs",
        },
      },
      { $unwind: "$pdfs" },
      {
        $group: {
          _id: "$pdfs.status",
          count: { $sum: 1 },
        },
      },
    ]);

    let bookletNotStarted = 0;
    let bookletPending = 0;

    bookletAgg.forEach((item) => {
      if (item._id === "false") bookletNotStarted = item.count;
      if (item._id === "progress") bookletPending = item.count;
    });

    /* ===============================
       COMPLETED TASKS
    =============================== */

    const questionCompletedTasks = await Task.countDocuments({
      userId: evaluatorId,
      status: "success",
    });

    const bookletCompletedTasks = await BookletTask.countDocuments({
      userId: evaluatorId,
      status: "success",
    });

    return {
      completedTasks: questionCompletedTasks + bookletCompletedTasks,
      notStartedBooklets: questionNotStarted + bookletNotStarted,
      pendingBooklets: questionPending + bookletPending,
    };
  } catch (error) {
    console.error("Evaluator analytics error:", error);
    throw error;
  }
}

export async function getReviewerAnalytics(userId) {
  try {
    const reviewerId = new mongoose.Types.ObjectId(userId);

    /* ===============================
       NOT STARTED TASKS
    =============================== */

    const questionNotStarted = await Task.countDocuments({
      userId: reviewerId,
      status: "inactive",
    });

    const bookletNotStarted = await BookletTask.countDocuments({
      userId: reviewerId,
      status: "inactive",
    });

    /* ===============================
       PENDING TASKS (ACTIVE)
    =============================== */

    const questionPending = await Task.countDocuments({
      userId: reviewerId,
      status: "active",
    });

    const bookletPending = await BookletTask.countDocuments({
      userId: reviewerId,
      status: "active",
    });

    /* ===============================
       COMPLETED REVIEWER TASKS
    =============================== */

    const completedTasks = await ReviewerTask.countDocuments({
      reviewerId: reviewerId,
      status: "completed",
    });

    return {
      completedTasks,
      notStartedBooklets: questionNotStarted + bookletNotStarted,
      pendingBooklets: questionPending + bookletPending,
    };

  } catch (error) {
    console.error("Reviewer analytics error:", error);
    throw error;
  }
}

export async function getPrincipalAnalytics() {
  try {
    const rejectedBooklets = await answerPdf.countDocuments({
      status: "reject",
    });

    return {
      rejectedBooklets,
    };
  } catch (error) {
    console.error("Principal analytics error:", error);
    throw error;
  }
}
