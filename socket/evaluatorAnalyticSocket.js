import Task from "../models/taskModels/taskModel.js";
import mongoose from "mongoose";
import BookletTask from "../models/taskModels/bookletTaskModel.js";
import BookletAnswerPdf from "../models/EvaluationModels/bookletAnswerPdfModel.js";

export default function handleEvaluatorAnalyticsSocket(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Client connected for analytics:", socket.id);

    let interval = null;

    // ==========================================
    // JOIN EVALUATOR ANALYTICS ROOM (PER USER)
    // ==========================================
    socket.on("join-evaluatorAnalytics-room", async ({ userId }) => {
      if (!userId) return;

      const roomName = `evaluator-analytics-${userId}`;
      socket.join(roomName);

      console.log(`🟢 ${socket.id} joined ${roomName}`);
      socket.emit("room-joined", { room: roomName });

      const sendAnalytics = async () => {
        try {
          const analytics = await getEvaluatorAnalytics(userId);
          io.to(roomName).emit("evaluator-analytics-data", analytics);
        } catch (err) {
          console.error("❌ Analytics fetch error:", err);
          socket.emit("evaluator-analytics-error", {
            message: "Failed to fetch analytics",
          });
        }
      };

      // Send immediately
      await sendAnalytics();

      // Auto refresh every 30 seconds
      interval = setInterval(sendAnalytics, 30000);
    });

    // ==========================================
    // MANUAL REFRESH FROM FRONTEND
    // ==========================================
    socket.on("get-evaluator-analytics", async ({ userId }) => {
      if (!userId) return;

      const roomName = `evaluator-analytics-${userId}`;

      try {
        const analytics = await getEvaluatorAnalytics(userId);
        io.to(roomName).emit("evaluator-analytics-data", analytics);
      } catch (error) {
        console.error("❌ Manual refresh error:", error);
        socket.emit("evaluator-analytics-error", {
          message: "Failed to fetch analytics",
        });
      }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================
    socket.on("disconnect", () => {
      if (interval) clearInterval(interval);
      console.log("🔴 Client disconnected:", socket.id);
    });
  });
}

/* ========================================================================== */
/* ======================= ANALYTICS FUNCTION =============================== */
/* ========================================================================== */

export async function getEvaluatorAnalytics(userId) {
  try {
    console.log("🔥 NEW ANALYTICS FUNCTION RUNNING");
    const evaluatorId = new mongoose.Types.ObjectId(userId);

    /* ===============================
       QUESTION-WISE BOOKLET COUNTS
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
       BOOKLET-WISE BOOKLET COUNTS
    =============================== */

    const bookletAgg = await BookletTask.aggregate([
      { $match: { userId: evaluatorId } },
      {
        $lookup: {
          from: "bookletanswerpdfs",
          localField: "_id",
          foreignField: "bookletTaskId",  // ✅ FIXED HERE
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

    /* ===============================
       FINAL RESPONSE (ONLY 3 VALUES)
    =============================== */

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
