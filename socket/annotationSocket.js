import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Task from "../models/taskModels/taskModel.js";
import Subject from "../models/classModel/subjectModel.js";
import QuestionDefinition from "../models/schemeModel/questionDefinitionSchema.js";
import SubjectSchemaRelation from "../models/subjectSchemaRelationModel/subjectSchemaRelationModel.js";
import AnswerPdfImage from "../models/EvaluationModels/answerPdfImageModel.js";

import BookletTask from "../models/taskModels/bookletTaskModel.js";
import BookletAnswerPdfImage from "../models/EvaluationModels/bookletAnswerPdfImageModel.js";

import Schema from "../models/schemeModel/schema.js";
import Marks from "../models/EvaluationModels/marksModel.js";
import HeadMarks from "../models/EvaluationModels/headMarksModel.js";
import mongoose from "mongoose";

import { isValidObjectId } from "../services/mongoIdValidation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDataDir = path.join(__dirname, "../Annotations");
const bookletBaseDataDir = path.join(__dirname, "../BookletAnnotations");

// FIXED: Only use answerPdfId and page
export function getFilePath(
  userId,
  answerPdfId,
  page,
  taskType = "question",
  evaluatorId = null,
) {
  console.log("🧩 getFilePath called with:", {
    userId,
    answerPdfId,
    page,
    baseDataDir,
    evaluatorId,
  });

  const rootDir = taskType === "booklet" ? bookletBaseDataDir : baseDataDir;

  let pdfDir;

  if (evaluatorId) {
    // 🔥 HEAD EVALUATOR CASE
    pdfDir = path.join(
      String(rootDir),
      String(evaluatorId), // ROOT (original evaluator)
      String(answerPdfId),
      String(userId), // CHILD (head evaluator)
    );
  } else {
    // ✅ NORMAL EVALUATOR
    pdfDir = path.join(String(rootDir), String(userId), String(answerPdfId));
  }

  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  return path.join(pdfDir, `page_${String(page)}.json`);
}

export function getMarksDataFilePath(
  userId,
  answerPdfId,
  taskType = "question",
  evaluatorId = null,
) {
  // Create path: Annotations/answerPdfId/
  const rootDir = taskType === "booklet" ? bookletBaseDataDir : baseDataDir;

  const pdfDir = evaluatorId
    ? path.join(
        String(rootDir),
        String(evaluatorId),
        String(answerPdfId),
        String(userId),
      )
    : path.join(String(rootDir), String(userId), String(answerPdfId));

  // Ensure directory exists
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  return path.join(pdfDir, `marksData.json`);
}

export function getMarksFilePath(
  userId,
  answerPdfId,
  taskType = "question",
  evaluatorId = null,
) {
  // Create path: Annotations/userId/answerPdfId/
  const rootDir = taskType === "booklet" ? bookletBaseDataDir : baseDataDir;

  const pdfDir = evaluatorId
    ? path.join(
        String(rootDir),
        String(evaluatorId),
        String(answerPdfId),
        String(userId),
      )
    : path.join(String(rootDir), String(userId), String(answerPdfId));

  // Ensure directory exists
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  return path.join(pdfDir, `marks.json`);
}

export default function handleAnnotationSocket(io) {
  io.on("connection", (socket) => {
    console.log("🟢 Client connected:", socket.id);

    socket.taskType = "question";

    // ✅ Client joins a room (each taskId = separate room for entire PDF)
    socket.on("join-AnnotationRoom", async ({ taskId }) => {
      let task = await Task.findById(taskId);
      let isBooklet = false;

      if (!task) {
        const bookletTask = await BookletTask.findById(taskId);
        if (bookletTask) isBooklet = true;
      }

      const roomName = isBooklet ? `booklet_${taskId}` : `task_${taskId}`;

      socket.taskType = isBooklet ? "booklet" : "question";

      socket.join(roomName);

      console.log(`🟢 Client ${socket.id} joined room: ${roomName}`);

      socket.emit("room-joined", { taskId, room: roomName });
    });

    const getEvaluatorContext = async (taskId, userId) => {
      const task = await Task.findById(taskId);
      if (!task) return { evaluatorId: null, isHead: false };

      const user = await mongoose.model("User").findById(userId).select("role");
      console.log("USER:", user);

      const role = user?.role?.toLowerCase();
      const isHead = role === "headevaluator";

      return {
        evaluatorId: isHead ? task.evaluatorId : null, // 🔥 ONLY FOR HEAD
        isHead,
      };
    };

    const clearHeadFolder = (userId, answerPdfId, evaluatorId, taskType) => {
      const rootDir = taskType === "booklet" ? bookletBaseDataDir : baseDataDir;

      const headFolderPath = path.join(
        String(rootDir),
        String(evaluatorId),
        String(answerPdfId),
        String(userId),
      );

      try {
        if (fs.existsSync(headFolderPath)) {
          // 🔥 DELETE COMPLETE FOLDER
          fs.rmSync(headFolderPath, { recursive: true, force: true });
          console.log("🔥 Head folder deleted:", headFolderPath);
        }

        // 🔥 RECREATE EMPTY FOLDER
        fs.mkdirSync(headFolderPath, { recursive: true });
        console.log("✅ Fresh head folder created:", headFolderPath);
      } catch (err) {
        console.error("❌ Error clearing head folder:", err);
      }
    };

    const validateHeadAccess = (userId, evaluatorId) => {
      // ❌ HEAD trying to write evaluator folder
      if (evaluatorId && String(userId) === String(evaluatorId)) {
        throw new Error("❌ Head evaluator cannot modify evaluator files");
      }
    };

    // ✅ Helper functions
    const loadData = (userId, answerPdfId, page, evaluatorId) => {
      if (answerPdfId === null || answerPdfId === undefined) {
        return { annotations: [], comments: [] };
      }
      const filePath = getFilePath(
        userId,
        answerPdfId,
        page,
        socket.taskType,
        evaluatorId,
      );
      if (fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (error) {
          console.error("Error loading data:", error);
          return { annotations: [], comments: [] };
        }
      }
      return { annotations: [], comments: [] };
    };

    const loadMarksData = (userId, answerPdfId, evaluatorId) => {
      const filePath = getMarksDataFilePath(
        userId,
        answerPdfId,
        socket.taskType,
        evaluatorId,
      );
      if (fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (error) {
          console.error("Error loading data:", error);
          return { marks: [] };
        }
      }
      return { marks: [] };
    };
    const loadMarks = (userId, answerPdfId, evaluatorId) => {
      const filePath = getMarksFilePath(
        userId,
        answerPdfId,
        socket.taskType,
        evaluatorId,
      );
      if (fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (error) {
          console.error("Error loading data:", error);
          return { marks: [] };
        }
      }
      return { marks: [] };
    };

    const saveData = (taskId, userId, answerPdfId, page, data, evaluatorId) => {
      try {
        // BLOCK INVALID ACCESS
        validateHeadAccess(userId, evaluatorId);
        const filePath = getFilePath(
          userId,
          answerPdfId,
          page,
          socket.taskType,
          evaluatorId,
        );
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(
          `✅ Data saved for task ${taskId}, ${answerPdfId}, page ${page}`,
        );
      } catch (error) {
        console.error("Error saving data:", error);
      }
    };

    const saveMarksData = (
      userId,
      answerPdfId,
      data,
      evaluatorId,
      isHead = false,
    ) => {
      try {
        validateHeadAccess(userId, evaluatorId);
        const filePath = getMarksDataFilePath(
          userId,
          answerPdfId,
          socket.taskType,
          evaluatorId,
        );

        console.log("🚨 FORCE SAVING DATA");
        console.log(
          "Question 1 allottedMarks:",
          data.marks.find((m) => m.questionsName === "1")?.allottedMarks,
        );

        // 🔥 HEAD CASE → ALWAYS OVERWRITE FILE
        data.lastSaved = new Date().toISOString();

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        data.lastSaved = new Date().toISOString();

        // Method 1: Force sync write
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        fs.fsyncSync(fs.openSync(filePath, "r+")); // Force OS to flush to disk

        console.log("✅ FILE FORCE SAVED");

        // Immediate verification
        const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
        console.log(
          "✅ VERIFIED - Saved Question 1 allottedMarks:",
          saved.marks.find((m) => m.questionsName === "1")?.allottedMarks,
        );
      } catch (error) {
        console.error("❌ SAVE ERROR:", error);
      }
    };

    const saveMarks = (userId, answerPdfId, data, evaluatorId) => {
      try {
        validateHeadAccess(userId, evaluatorId);
        const filePath = getMarksFilePath(
          userId,
          answerPdfId,
          socket.taskType,
          evaluatorId,
        );
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ marks saved for answerPdfId ${answerPdfId}`);
      } catch (error) {
        console.error("Error saving data:", error);
      }
    };

    // ✅ Load specific page data
    socket.on("load-page-data", async (data) => {
      try {
        console.log("data", data);

        const { taskId, userId, answerPdfId, page } = data;
        console.log(`📄 Loading data for task ${taskId}, page ${page}`);

        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        if (answerPdfId === null || answerPdfId === undefined) {
          return { annotations: [], comments: [] };
        }

        const fileData = loadData(userId, answerPdfId, page, evaluatorId);
        console.log("fileData", fileData);

        socket.emit("page-data-loaded", fileData);
        console.log(`✅ Page data sent for task ${taskId}, page ${page}`);
      } catch (error) {
        console.error("Error in load-page-data:", error);
        socket.emit("error", { message: "Failed to load page data" });
      }
    });

    // ✅ Add annotation
    socket.on("add-annotation", async (data) => {
      try {
        console.log("data", data);

        const { taskId, answerPdfId, userId, page } = data;

        console.log(`📝 Adding annotation to task ${taskId}, page ${page}`);

        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        if (!userId || !answerPdfId || page === undefined || page === null) {
          console.error("❌ INVALID ADD-ANNOTATION PAYLOAD", {
            userId,
            answerPdfId,
            page,
            taskId,
          });
          return;
        }

        const fileData = loadData(userId, answerPdfId, page, evaluatorId);
        console.log("data loaded");

        const annotationObject = {
          // Generate ID if not provided
          id: data.timeStamps,
          taskId: data.taskId,
          page: data.page,
          answerPdfImageId: data.answerPdfImageId,
          answerPdfId: data.answerPdfId,
          userId: data.userId,
          questionDefinitionId: data.questionDefinitionId,
          iconUrl: data.iconUrl,
          question: data.question,
          timeStamps: data.timeStamps || new Date().toLocaleString(),
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          synced: data.synced !== undefined ? data.synced : false,
          mark: data.mark || 0,
          parentQuestionId: data.parentQuestionId,
        };

        // Check if annotation with same timestamp ID already exists
        const existingAnnotationIndex = fileData.annotations.findIndex(
          (ann) => ann.id === data.timeStamps,
        );

        if (existingAnnotationIndex !== -1) {
          // ✅ UPDATE existing annotation
          fileData.annotations[existingAnnotationIndex] = {
            ...fileData.annotations[existingAnnotationIndex],
            ...annotationObject, // Update with new data
          };
          console.log(
            "✅ Existing annotation updated with ID:",
            data.timeStamps,
          );
        } else {
          // ✅ ADD new annotation
          fileData.annotations.push(annotationObject);
          console.log("✅ New annotation added with ID:", data.timeStamps);
        }

        saveData(taskId, userId, answerPdfId, page, fileData, evaluatorId);

        console.log(
          "Annotation added → marks will be handled in add-marks only",
        );
        console.log("fileData after processing:", fileData);

        // Broadcast to the task room (all pages in same PDF)
        const roomName =
          socket.taskType === "booklet"
            ? `booklet_${taskId}`
            : `task_${taskId}`;
        io.to(roomName).emit("annotations-updated", {
          ...fileData,
          status: "submitted",
        });

        if (socket.taskType === "booklet") {
          await BookletAnswerPdfImage.updateOne(
            {
              bookletAnswerPdfId: answerPdfId,
              name: `image_${data.page}.png`,
            },
            {
              $set: { status: "submitted", updatedAt: new Date() },
            },
          );
        } else {
          await AnswerPdfImage.updateOne(
            {
              answerPdfId: answerPdfId,
              name: `image_${data.page}.png`,
            },
            {
              $set: { status: "submitted", updatedAt: new Date() },
            },
          );
        }
        emitMarksUpdate(io, taskId, userId, answerPdfId);

        console.log(`✅ Annotation added and broadcast to room: ${roomName}`);
        // console.log("emitted fileData", fileData);
      } catch (error) {
        console.error("Error in add-annotation:", error);
      }
    });

    // ✅ Add comment
    socket.on("add-comment", async (data) => {
      try {
        console.log("data", data);

        const { taskId, answerPdfId, userId, page } = data;
        console.log(`💬 Adding comment to task ${taskId}, page ${page}`);
        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        if (answerPdfId === null || answerPdfId === undefined) {
          return { annotations: [], comments: [] };
        }

        const fileData = loadData(userId, answerPdfId, page, evaluatorId);
        console.log("Data loaded");

        const commentObject = {
          // Generate ID if not provided
          id: data.id,
          userId: data.userId,
          taskId: data.taskId,
          page: data.page,
          answerPdfId: data.answerPdfId,
          text: data.text, // Assuming comment text property
          // timeStamps: data.timeStamps || new Date().toLocaleString(),
          x: data.x, // Comment position
          y: data.y,
          width: data.width,
          height: data.height,
          // Comment position
          // Add other comment properties as needed
          synced: data.synced !== undefined ? data.synced : false,
        };

        // Check if comment with same timestamp ID already exists
        const existingCommentIndex = fileData.comments.findIndex(
          (comment) => comment.id === commentObject.id,
        );

        if (existingCommentIndex !== -1) {
          // ✅ UPDATE existing comment
          fileData.comments[existingCommentIndex] = {
            ...fileData.comments[existingCommentIndex],
            ...commentObject, // Update with new data
          };
          console.log("✅ Existing comment updated with ID:", commentObject.id);
        } else {
          // ✅ ADD new comment
          fileData.comments.push(commentObject);
          console.log("✅ New comment added with ID:", commentObject.id);
        }
        saveData(taskId, userId, answerPdfId, page, fileData, evaluatorId);
        console.log("fileData after processing:", fileData);

        const roomName =
          socket.taskType === "booklet"
            ? `booklet_${taskId}`
            : `task_${taskId}`;
        io.to(roomName).emit("comments-updated", {
          ...fileData,
          status: "submitted",
        });

        console.log(`✅ Comment added and broadcast to room: ${roomName}`);
      } catch (error) {
        console.error("Error in add-comment:", error);
      }
    });

    //✅ Delete annotation
    socket.on("delete-annotation", async (data) => {
      try {
        console.log("data for delete annotation", data);

        const {
          taskId,
          answerPdfId,
          userId,
          page,
          annotationIds,
          questionName,
          allottedMarks,
          parentQuestionId,
        } = data;

        console.log("data", data);
        console.log(`🗑️ Deleting annotation from task ${taskId}, page ${page}`);

        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        let actualUserId = userId;

        // 🔥 FORCE: agar evaluatorId exist karta hai → matlab HEAD hai
        if (evaluatorId) {
          actualUserId = userId; // headEvaluatorId
        }

        if (!userId || !answerPdfId || page === undefined || page === null) {
          console.error("❌ INVALID DELETE-ANNOTATION PAYLOAD", {
            taskId,
            userId,
            answerPdfId,
            page,
            annotationIds,
          });
          return; // 🔥 Block unsafe folder writes
        }

        const fileData = loadData(actualUserId, answerPdfId, page, evaluatorId);
        console.log("dataloaded", fileData);

        const idSet = new Set(annotationIds);
        const initialCount = fileData.annotations.length;

        // const questionName = fileData.annotations.find((a) =>
        //   idSet.has(a.id)
        // )?.questionsName;

        fileData.annotations = fileData.annotations.filter(
          (a) => !idSet.has(a.id),
        );
        const deletedCount = initialCount - fileData.annotations.length;

        console.log(
          `✅ Deleted ${deletedCount} annotation(s), remaining: ${fileData.annotations.length}`,
        );

        saveData(taskId, userId, answerPdfId, page, fileData, evaluatorId);

        const marksData = loadMarks(userId, answerPdfId, evaluatorId);
        console.log("marks data loaded for deletion");

        const existingMarksIndex = marksData.marks.findIndex(
          (mark) => mark.question === questionName,
        );

        if (existingMarksIndex !== -1) {
          // Question exists - add the new marks to existing marks
          const existingMarks =
            marksData.marks[existingMarksIndex].allottedMarks || 0;
          console.log("existingMarks", existingMarks);

          const newMarks = allottedMarks || 0;
          console.log("newMarks", newMarks);

          const totalMarks = existingMarks - newMarks;
          console.log("totalMarks", totalMarks);

          // Update only the allottedMarks field, keep all other fields
          marksData.marks[existingMarksIndex] = {
            ...marksData.marks[existingMarksIndex],
            allottedMarks: totalMarks, // Only update the allottedMarks with accumulated value
          };

          console.log(
            "✅ Updated allottedMarks in marks.json :",
            questionName,
            "Previous:",
            existingMarks,
            "Added:",
            newMarks,
            "Total:",
            totalMarks,
          );

          saveMarks(userId, answerPdfId, marksData, evaluatorId);
        } else {
          console.log("❌ Question not found in questionMarksData.json:");
        }

        let questionMarksData = loadMarksData(userId, answerPdfId, evaluatorId);

        const existingMarksId = questionMarksData.marks.findIndex(
          (mark) => mark.questionsName === String(questionName),
        );

        if (existingMarksId !== -1) {
          // Question exists - add the new marks to existing marks
          const existingMarks =
            questionMarksData.marks[existingMarksId].allottedMarks || 0;
          console.log("existingMarks", existingMarks);

          const newMarks = allottedMarks || 0;
          console.log("newMarks", newMarks);

          const totalMarks = existingMarks - newMarks;
          console.log("totalMarks", totalMarks);

          // Update only the allottedMarks field, keep all other fields
          questionMarksData.marks[existingMarksId] = {
            ...questionMarksData.marks[existingMarksId],
            allottedMarks: totalMarks, // Only update the allottedMarks with accumulated value
            isMarked: true, // Mark as marked
            updatedAt: new Date().toISOString(), // Update timestamp
          };

          console.log(
            "✅ Updated allottedMarks in questionMarksData.json for Question:",
            questionName,
            "Previous:",
            existingMarks,
            "Added:",
            newMarks,
            "Total:",
            totalMarks,
          );

          saveMarksData(
            userId,
            answerPdfId,
            questionMarksData,
            evaluatorId,
            isHead,
          );
        } else {
          console.log("❌ Question not found in questionMarksData.json:");
        }

        console.log("parentIndex for delete", parentQuestionId);

        if (parentQuestionId) {
          const parentIndex = questionMarksData.marks.findIndex(
            (m) => m._id === parentQuestionId,
          );
          console.log("parentIndex", parentIndex);

          if (parentIndex !== -1) {
            const existingMarks =
              questionMarksData.marks[parentIndex].allottedMarks || 0;
            console.log("existingMarks for parent", existingMarks);

            const newMarks = data.allottedMarks || 0;
            console.log("newMarks for parent", newMarks);

            const totalMarks = existingMarks - newMarks;
            console.log("totalMarks for parent", totalMarks);

            questionMarksData.marks[parentIndex] = {
              ...questionMarksData.marks[parentIndex],
              allottedMarks: totalMarks,
              isMarked: true,
              updatedAt: new Date().toISOString(),
            };
          }

          saveMarksData(
            userId,
            answerPdfId,
            questionMarksData,
            evaluatorId,
            isHead,
          );
          console.log(
            "questionMarksData after processing:",
            questionMarksData.marks[parentIndex],
          );
        }

        console.log("DELETE INPUT VALIDATION CHECK:", {
          userId,
          answerPdfId,
          page,
          typeUserId: typeof userId,
          typeAnswerPdfId: typeof answerPdfId,
          typePage: typeof page,
        });

        const filePath = getFilePath(
          userId,
          answerPdfId,
          page,
          socket.taskType,
          evaluatorId,
        );
        console.log("filePath", filePath);

        const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

        const annotationsEmpty =
          !fileData.annotations || fileData.annotations.length === 0;
        const commentsEmpty =
          !fileData.comments || fileData.comments.length === 0;

        const status =
          annotationsEmpty && commentsEmpty ? "visited" : "submitted";

        console.log("📌 FINAL STATUS:", status);

        const roomName =
          socket.taskType === "booklet"
            ? `booklet_${taskId}`
            : `task_${taskId}`;
        io.to(roomName).emit(
          "annotations-deleted",
          {
            ...fileData,
          },
          { status: status },
        );
        console.log("DEBUG → page:", page);
        console.log("DEBUG → trying to update:", `image_${page}.png`);

        try {
          // Try multiple approaches to find the document
          let result;

          if (socket.taskType === "booklet") {
            result = await BookletAnswerPdfImage.updateOne(
              {
                $or: [
                  { bookletAnswerPdfId: answerPdfId },
                  {
                    bookletAnswerPdfId: new mongoose.Types.ObjectId(
                      answerPdfId,
                    ),
                  },
                ],
                name: { $regex: `image_${page}`, $options: "i" },
              },
              {
                $set: {
                  status: status,
                  updatedAt: new Date(),
                },
              },
            );
          } else {
            result = await AnswerPdfImage.updateOne(
              {
                $or: [
                  { answerPdfId: answerPdfId },
                  { answerPdfId: new mongoose.Types.ObjectId(answerPdfId) },
                ],
                name: { $regex: `image_${page}`, $options: "i" },
              },
              {
                $set: {
                  status: status,
                  updatedAt: new Date(),
                },
              },
            );
          }

          emitMarksUpdate(io, taskId, userId, answerPdfId);

          console.log(
            `✅ DB Update - Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
          );

          if (result.matchedCount === 0) {
            console.log("⚠️  No documents matched the criteria");
          }

          return result;
        } catch (error) {
          console.error("❌ Database update error:", error);
        }
      } catch (error) {
        console.error("Error in delete-annotation:", error);
      }
    });

    // ✅ Delete comment
    socket.on("delete-comment", async (data) => {
      try {
        console.log("🗑️ Delete comment data:", data);

        const { taskId, userId, answerPdfId, page, commentIds } = data;

        console.log("User Id of the comment is this -:", userId);

        console.log("Incoming AnswerPdf Id -:", answerPdfId);
        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        // Validate required fields
        if (!taskId || !answerPdfId || page === undefined || !commentIds) {
          console.error("❌ Missing required fields for delete-comment");
          return;
        }
        if (answerPdfId === null || answerPdfId === undefined) {
          return { annotations: [], comments: [] };
        }

        console.log(`🗑️ Deleting comment from task ${taskId}, page ${page}`);

        const fileData = loadData(userId, answerPdfId, page, evaluatorId);
        console.log("Data loaded", fileData);

        // Ensure comments array exists
        if (!fileData.comments || !Array.isArray(fileData.comments)) {
          fileData.comments = [];
        }

        const idSet = new Set(commentIds);
        const initialCount = fileData.comments.length;

        fileData.comments = fileData.comments.filter(
          (c) => c && c.id && !idSet.has(c.id), // Additional safety checks
        );

        const deletedCount = initialCount - fileData.comments.length;

        console.log(
          `✅ Deleted ${deletedCount} comment(s), remaining: ${fileData.comments.length}`,
        );

        saveData(taskId, userId, answerPdfId, page, fileData, evaluatorId);

        const verifyData = loadData(userId, answerPdfId, page, evaluatorId);
        console.log("AFTER DELETE (FILE):", verifyData.comments);

        const roomName =
          socket.taskType === "booklet"
            ? `booklet_${taskId}`
            : `task_${taskId}`;
        io.to(roomName).emit("comments-deleted", {
          ...fileData,
          status: "completed",
        });

        console.log(`✅ Comment deleted and broadcast to room: ${roomName}`);
      } catch (error) {
        console.error("Error in delete-comment:", error);
      }
    });

    socket.on("add-marks", async (data) => {
      try {
        console.log("marks-data", data);

        const { taskId, userId, answerPdfId } = data;

        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );
        const user = await mongoose
          .model("User")
          .findById(userId)
          .select("role");

        if (!answerPdfId) return;

        // /* ========================================================= */
        // /* 🔥 HEAD EVALUATOR FLOW (SEPARATE COLLECTION)              */
        // /* ========================================================= */

        // if (isHead) {
        //   // ✅ 1. SAVE IN DB (same as before)
        //   const existing = await HeadMarks.findOne({
        //     answerPdfId,
        //     questionDefinitionId: data.questionDefinitionId,
        //     headEvaluatorId: userId,
        //   });

        //   if (existing) {
        //     // existing.allottedMarks += data.allottedMarks || 0;
        //     existing.timerStamps = data.timeStamps;
        //     existing.isMarked = true;
        //     await existing.save();
        //   } else {
        //     await HeadMarks.create({
        //       answerPdfId,
        //       questionDefinitionId: data.questionDefinitionId,
        //       headEvaluatorId: userId,
        //       allottedMarks: data.allottedMarks || 0,
        //       timerStamps: data.timeStamps,
        //       isMarked: true,
        //     });
        //   }

        //   console.log("✅ Head marks saved in DB");

        //   //  2. UPDATE marksData.json ALSO

        //   let questionMarksData = loadMarksData(
        //     userId,
        //     answerPdfId,
        //     evaluatorId,
        //   );

        //   const existingIndex = questionMarksData.marks.findIndex(
        //     (m) => m._id === data.questionDefinitionId,
        //   );

        //   if (existingIndex !== -1) {
        //     questionMarksData.marks[existingIndex].allottedMarks +=
        //       data.allottedMarks || 0;
        //     questionMarksData.marks[existingIndex].isMarked = true;
        //     questionMarksData.marks[existingIndex].updatedAt =
        //       new Date().toISOString();
        //   } else {
        //     // fallback (rare)
        //     questionMarksData.marks.push({
        //       _id: data.questionDefinitionId,
        //       questionsName: data.question,
        //       allottedMarks: data.allottedMarks || 0,
        //       isMarked: true,
        //       updatedAt: new Date().toISOString(),
        //     });
        //   }

        //   // 🔥 IMPORTANT → pass isHead = true
        //   saveMarksData(
        //     userId,
        //     answerPdfId,
        //     questionMarksData,
        //     evaluatorId,
        //     true,
        //   );

        //   console.log("Head marksData.json updated");

        //   // 🔁 EMIT UPDATED DATA
        //   const headMarks = await HeadMarks.find({
        //     answerPdfId,
        //     headEvaluatorId: userId,
        //   });

        //   const roomName =
        //     socket.taskType === "booklet"
        //       ? `booklet_${taskId}`
        //       : `task_${taskId}`;

        //   io.to(roomName).emit("marks-updated", {
        //     marks: headMarks,
        //     status: "completed",
        //   });

        //   return;
        // }

        /* ========================================================= */
        /* ✅ NORMAL FLOW (EVALUATOR + DEPUTY HEAD)                  */
        /* ========================================================= */

        const marksData = loadMarks(userId, answerPdfId, evaluatorId);

        const marksObject = {
          id: data.id,
          taskId: data.taskId,
          page: data.page,
          answerPdfId: data.answerPdfId,
          questionDefinitionId: data.questionDefinitionId,
          question: data.question,
          parentQuestionId: data.parentQuestionId,
          allottedMarks: data.allottedMarks || 0,
          timeStamps: data.timeStamps || new Date().toLocaleString(),
          synced: data.synced !== undefined ? data.synced : false,
        };

        const existingMarksIndex = marksData.marks.findIndex(
          (mark) => mark.question === marksObject.question,
        );

        if (existingMarksIndex !== -1) {
          const existingMarks =
            marksData.marks[existingMarksIndex].allottedMarks || 0;

          marksData.marks[existingMarksIndex] = {
            ...marksData.marks[existingMarksIndex],
            ...marksObject,
            allottedMarks: existingMarks + marksObject.allottedMarks,
          };
        } else {
          marksData.marks.push(marksObject);
        }

        console.log(
          "📁 MARKS PATH:",
          getMarksFilePath(userId, answerPdfId, socket.taskType, evaluatorId),
        );
        console.log("📦 MARKS DATA BEFORE SAVE:", marksData);

        saveMarks(userId, answerPdfId, marksData, evaluatorId);

        console.log("✅ MARKS SAVED FOR:", userId, "HEAD:", evaluatorId);

        const questionMarksData = loadMarksData(
          userId,
          answerPdfId,
          evaluatorId,
        );

        const existingMarksId = questionMarksData.marks.findIndex(
          (mark) => mark.questionsName === String(marksObject.question),
        );

        if (existingMarksId !== -1) {
          const existingMarks =
            questionMarksData.marks[existingMarksId].allottedMarks || 0;

          questionMarksData.marks[existingMarksId] = {
            ...questionMarksData.marks[existingMarksId],
            allottedMarks: existingMarks + marksObject.allottedMarks,
            isMarked: true,
            updatedAt: new Date().toISOString(),
          };
        }

        saveMarksData(
          userId,
          answerPdfId,
          questionMarksData,
          evaluatorId,
          isHead,
        );

        emitMarksUpdate(io, taskId, userId, answerPdfId);

        const roomName =
          socket.taskType === "booklet"
            ? `booklet_${taskId}`
            : `task_${taskId}`;

        io.to(roomName).emit("marks-updated", {
          ...questionMarksData,
          status: "completed",
        });

        console.log("✅ Normal marks flow executed");
      } catch (error) {
        console.error("Error in add-marks:", error);
      }
    });

    // socket.on("get-questions", (data) => {
    //   try {
    //     // console.log("📊 Get marks request:", data);
    //     // Check if data is an array (multiple marks)
    //     if (!Array.isArray(data)) {
    //       throw new Error("Data should be an array of marks");
    //     }

    //     if (data.length === 0) {
    //       console.log("No marks data received");
    //       return;
    //     }

    //     // Extract answerPdfId from the first item (all should have the same answerPdfId)
    //     const firstMark = data[0];
    //     const answerPdfId = firstMark.answerPdfId;

    //     if (!answerPdfId) {
    //       throw new Error("answerPdfId is required in mark data");
    //     }

    //     const questionMarksData = loadMarksData(answerPdfId);

    //     if (questionMarksData.marks && questionMarksData.marks.length > 0) {
    //       console.log("✅ Marks data already exists, skipping creation");
    //       return;
    //     }

    //     console.log(
    //       `📊 Processing ${data.length} marks for answerPdfId ${answerPdfId}`
    //     );

    //     // Create file data structure with the received array as marks
    //     const fileData = {
    //       marks: [], // Save the received array directly as marks
    //     };

    //     // Process each mark in the array
    //     data.forEach((mark, index) => {
    //       const marksData = {
    //         _id: mark._id,
    //         schemaId: mark.schemaId,
    //         parentQuestionId: mark.parentQuestionId || null,
    //         questionsName: mark.questionsName,
    //         maxMarks: mark.maxMarks || 10,
    //         minMarks: mark.minMarks || 0,
    //         isSubQuestion: mark.isSubQuestion || false,
    //         bonusMarks: mark.bonusMarks || 0,
    //         marksDifference: mark.marksDifference || 1,
    //         numberOfSubQuestions: mark.numberOfSubQuestions || 0,
    //         compulsorySubQuestions: mark.compulsorySubQuestions || 0,
    //         __v: mark.__v || 0,
    //         allottedMarks: mark.allottedMarks || 0,
    //         answerPdfId: mark.answerPdfId,
    //         timerStamps: mark.timerStamps || mark.timeStamps || "",
    //         isMarked: mark.isMarked !== undefined ? mark.isMarked : false,
    //         updatedAt: new Date().toISOString(),
    //       };

    //       fileData.marks.push(marksData);
    //       console.log(
    //         `✅ Processed mark ${index + 1}: ${marksData.questionsName}`
    //       );
    //     });

    //     saveMarksData(answerPdfId, fileData);
    //     // console.log("fileData after processing:", fileData);

    //     // Emit back to the socket only
    //     socket.emit("marks-saved", {
    //       success: true,
    //       answerPdfId: answerPdfId,
    //     });
    //   } catch (error) {
    //     console.error("Error in get-marks:", error);
    //     socket.emit("error", { message: "Failed to get marks data" });
    //   }
    // });

    // ✅ Leave room

    // socket.on("get-questions", async (data) => {
    //   try {
    //     console.log("📊 Get questions request:", data);

    //     // Expect data to contain taskId and answerPdfId
    //     const { taskId, userId, answerPdfId } = data;

    //     if (answerPdfId === null || answerPdfId === undefined) {
    //       return { annotations: [], comments: [] };
    //     }

    //     if (!taskId || !answerPdfId) {
    //       throw new Error("taskId and answerPdfId are required");
    //     }

    //     // Validate IDs
    //     if (!isValidObjectId(taskId)) {
    //       throw new Error("Invalid task ID");
    //     }

    //     if (!isValidObjectId(answerPdfId)) {
    //       throw new Error("Invalid answerPdfId");
    //     }

    //     // Check if marks data already exists in local file
    //     const questionMarksData = loadMarksData(userId, answerPdfId);

    //     if (questionMarksData.marks && questionMarksData.marks.length > 0) {
    //       console.log("✅ Marks data already exists, skipping creation");

    //       // Emit existing data back to client
    //       socket.emit("questions-data", {
    //         success: true,
    //         answerPdfId: answerPdfId,
    //         marks: questionMarksData.marks,
    //         status: "completed",
    //       });
    //       return;
    //     }

    //     console.log(`🔄 Fetching question definitions for task ${taskId}`);

    //     // Retrieve the task from database
    //     const task = await Task.findById(taskId);
    //     if (!task) {
    //       throw new Error("Task not found");
    //     }

    //     const subject = await Subject.findOne({ code: task.subjectCode });
    //     if (!subject) {
    //       throw new Error("Subject not found (create subject)");
    //     }

    //     const courseSchemaDetails = await SubjectSchemaRelation.findOne({
    //       subjectId: subject._id,
    //     });
    //     if (!courseSchemaDetails) {
    //       throw new Error("Schema not found for the subject");
    //     }

    //     const schemaDetails = await Schema.findOne({
    //       _id: courseSchemaDetails.schemaId,
    //     });
    //     if (!schemaDetails) {
    //       throw new Error("Schema not found");
    //     }

    //     // Fetch all QuestionDefinitions for the schema
    //     const questionDefinitions = await QuestionDefinition.find({
    //       schemaId: schemaDetails.id,
    //     });

    //     if (!questionDefinitions || questionDefinitions.length === 0) {
    //       throw new Error("No QuestionDefinitions found");
    //     }

    //     // Fetch Marks data from database based on the provided answerPdfId
    //     const marksData = await Marks.find({ answerPdfId: answerPdfId });

    //     // Create file data structure
    //     const fileData = {
    //       marks: [],
    //     };

    //     // Process each question definition and combine with marks data
    //     questionDefinitions.forEach((question, index) => {
    //       // Find the related Marks entry for the current questionDefinitionId
    //       const marks = marksData.find(
    //         (m) =>
    //           m.questionDefinitionId.toString() === question._id.toString(),
    //       );

    //       // Use marks data if exists, otherwise use defaults
    //       const marksInfo = marks
    //         ? {
    //             allottedMarks: marks.allottedMarks,
    //             timerStamps: marks.timerStamps,
    //             isMarked: marks.isMarked,
    //           }
    //         : {
    //             allottedMarks: 0,
    //             timerStamps: "",
    //             isMarked: false,
    //           };

    //       const marksDataObj = {
    //         _id: question._id.toString(),
    //         schemaId: question.schemaId,
    //         parentQuestionId: question.parentQuestionId || null,
    //         questionsName: question.questionsName,
    //         maxMarks: question.maxMarks || 10,
    //         minMarks: question.minMarks || 0,
    //         isSubQuestion: question.isSubQuestion || false,
    //         bonusMarks: question.bonusMarks || 0,
    //         marksDifference: question.marksDifference || 1,
    //         numberOfSubQuestions: question.numberOfSubQuestions || 0,
    //         compulsorySubQuestions: question.compulsorySubQuestions || 0,
    //         __v: question.__v || 0,
    //         allottedMarks: marksInfo.allottedMarks,
    //         answerPdfId: answerPdfId,
    //         timerStamps: marksInfo.timerStamps,
    //         isMarked: marksInfo.isMarked,
    //         updatedAt: new Date().toISOString(),
    //       };

    //       fileData.marks.push(marksDataObj);
    //       console.log(
    //         `✅ Processed question ${index + 1}: ${marksDataObj.questionsName}`,
    //       );
    //     });

    //     // Save to local file
    //     saveMarksData(userId, answerPdfId, fileData);
    //     console.log(
    //       `✅ Saved ${fileData.marks.length} questions to local file`,
    //     );

    //     // Emit back to the socket
    //     socket.emit("questions-data", {
    //       success: true,
    //       answerPdfId: answerPdfId,
    //       marks: fileData.marks,
    //       status: "completed",
    //     });
    //   } catch (error) {
    //     console.error("Error in get-questions:", error);
    //     socket.emit("error", {
    //       success: false,
    //       message: error.message,
    //     });
    //   }
    // });
    //annotationSocket/get-questions
    socket.on("get-questions", async (data) => {
      try {
        console.log("📊 Get questions request:", data);

        const { taskId, userId, answerPdfId } = data;
        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        const folderKey = `${userId}_${answerPdfId}`;

        if (!global.clearedHeadFolders) {
          global.clearedHeadFolders = {};
        }

        if (isHead && !global.clearedHeadFolders[folderKey]) {
          clearHeadFolder(userId, answerPdfId, evaluatorId, socket.taskType);

          global.clearedHeadFolders[folderKey] = true;

          console.log("🔥 Head folder cleared ONCE");
        }

        console.log("Evaluator Id for the head is this -:", evaluatorId);
        console.log("Is Head Id is this -:", isHead);

        if (!taskId || !answerPdfId) {
          throw new Error("taskId and answerPdfId are required");
        }

        if (!isValidObjectId(taskId)) {
          throw new Error("Invalid task ID");
        }

        if (!isValidObjectId(answerPdfId)) {
          throw new Error("Invalid answerPdfId");
        }

        // Check existing local marks file
        let questionMarksData = { marks: [] };

        if (!isHead) {
          questionMarksData = loadMarksData(userId, answerPdfId, evaluatorId);

          if (questionMarksData.marks?.length > 0) {
            socket.emit("questions-data", {
              success: true,
              answerPdfId,
              marks: questionMarksData.marks,
              status: "completed",
            });
            return;
          }
        }

        // 🔥 Detect task type
        let task = await Task.findById(taskId);
        let isBooklet = false;

        if (!task) {
          task = await BookletTask.findById(taskId);
          if (task) {
            isBooklet = true;
          } else {
            throw new Error("Task not found");
          }
        }

        console.log("Task Type:", isBooklet ? "BOOKLET" : "QUESTION");

        // 🔥 SUBJECT FETCH (COMMON FOR BOTH)
        const subject = await Subject.findOne({ code: task.subjectCode });
        if (!subject) {
          throw new Error("Subject not found");
        }

        const courseSchemaDetails = await SubjectSchemaRelation.findOne({
          subjectId: subject._id,
        });
        if (!courseSchemaDetails) {
          throw new Error("Schema relation not found");
        }

        const schemaDetails = await Schema.findById(
          courseSchemaDetails.schemaId,
        );
        if (!schemaDetails) {
          throw new Error("Schema not found");
        }

        // 🔥 Fetch ALL questions for schema
        let questionDefinitions;

        if (!isBooklet) {
          // ✅ QUESTION-WISE → Only assigned question
          if (!task.questiondefinitionId) {
            throw new Error("Task does not have questionDefinitionId");
          }

          questionDefinitions = await QuestionDefinition.find({
            _id: task.questiondefinitionId,
          });
        } else {
          // ✅ BOOKLET-WISE → All questions
          questionDefinitions = await QuestionDefinition.find({
            schemaId: schemaDetails._id,
          }).sort({ questionsName: 1 });
        }

        if (!questionDefinitions.length) {
          throw new Error("No QuestionDefinitions found");
        }

        // 🔥 IMPORTANT FIX OF THE EVALUATOR AND HEAD EVALUATOR
        let marksData = [];

        if (!isHead) {
          // ✅ evaluator + deputy → same flow
          marksData = await Marks.find({ answerPdfId });
        } else {
          // ❌ head → DO NOT LOAD evaluator marks
          marksData = [];
        }

        const fileData = { marks: [] };

        questionDefinitions.forEach((question) => {
          const marks = marksData.find(
            (m) =>
              m.questionDefinitionId.toString() === question._id.toString(),
          );

          let marksInfo;

          if (isHead) {
            // 🔥 HEAD → ALWAYS START FROM 0
            marksInfo = {
              allottedMarks: 0,
              timerStamps: "",
              isMarked: false,
            };
          } else if (marks) {
            marksInfo = {
              allottedMarks: marks.allottedMarks,
              timerStamps: marks.timerStamps,
              isMarked: marks.isMarked,
            };
          } else {
            marksInfo = {
              allottedMarks: 0,
              timerStamps: "",
              isMarked: false,
            };
          }

          fileData.marks.push({
            _id: question._id.toString(),
            schemaId: question.schemaId,
            parentQuestionId: question.parentQuestionId || null,
            questionsName: question.questionsName,
            maxMarks: question.maxMarks || 10,
            minMarks: question.minMarks || 0,
            isSubQuestion: question.isSubQuestion || false,
            bonusMarks: question.bonusMarks || 0,
            marksDifference: question.marksDifference || 1,
            numberOfSubQuestions: question.numberOfSubQuestions || 0,
            compulsorySubQuestions: question.compulsorySubQuestions || 0,
            allottedMarks: marksInfo.allottedMarks,
            answerPdfId,
            timerStamps: marksInfo.timerStamps,
            isMarked: marksInfo.isMarked,
            updatedAt: new Date().toISOString(),
          });
        });

        // if (isHead) {
        //   const filePath = getMarksDataFilePath(
        //     userId,
        //     answerPdfId,
        //     socket.taskType,
        //     evaluatorId,
        //   );

        //   // 🔥 CLEAR FILE ON LOAD
        //   fs.writeFileSync(filePath, JSON.stringify({ marks: [] }, null, 2));

        //   console.log("🔥 Head file cleared on load");
        // }

        // Save locally
        const existingData = loadMarksData(userId, answerPdfId, evaluatorId);

        // 🔥 ONLY SAVE IF FILE IS EMPTY
        if (!existingData.marks || existingData.marks.length === 0) {
          saveMarksData(userId, answerPdfId, fileData, evaluatorId, isHead);
          console.log("✅ Initial marksData created");
        } else {
          console.log("⛔ Skipped overwrite - marksData already exists");
        }

        const latestMarksData = loadMarksData(userId, answerPdfId, evaluatorId);

        socket.emit("questions-data", {
          success: true,
          answerPdfId,
          marks: latestMarksData.marks,
          status: "completed",
        });

        console.log(`✅ Sent ${fileData.marks.length} questions to frontend`);
      } catch (error) {
        console.error("Error in get-questions:", error);
        socket.emit("error", {
          success: false,
          message: error.message,
        });
      }
    });

    socket.on("get-allquestions", async (data) => {
      try {
        console.log("📊 Get questions request:", data);

        // Expect data to contain taskId and answerPdfId
        const { taskId, userId, answerPdfId } = data;
        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        if (answerPdfId === null || answerPdfId === undefined) {
          return { annotations: [], comments: [] };
        }

        if (!taskId || !answerPdfId) {
          throw new Error("taskId and answerPdfId are required");
        }

        // Validate IDs
        if (!isValidObjectId(taskId)) {
          throw new Error("Invalid task ID");
        }

        if (!isValidObjectId(answerPdfId)) {
          throw new Error("Invalid answerPdfId");
        }

        // Check if marks data already exists in local file
        const questionMarksData = loadMarksData(
          userId,
          answerPdfId,
          evaluatorId,
        );

        if (questionMarksData.marks && questionMarksData.marks.length > 0) {
          console.log("✅ Marks data already exists, skipping creation");

          // Emit existing data back to client
          socket.emit("allquestions-data", {
            success: true,
            answerPdfId: answerPdfId,
            marks: questionMarksData.marks,
            status: "completed",
          });
          return;
        }

        console.log(`🔄 Fetching question definitions for task ${taskId}`);

        // Retrieve the task from database
        const task = await Task.findById(taskId);
        if (!task) {
          throw new Error("Task not found");
        }

        const taskQuestionDefinitionId = task.questiondefinitionId;

        if (!taskQuestionDefinitionId) {
          throw new Error("Task does not have questionDefinitionId");
        }

        const subject = await Subject.findOne({ code: task.subjectCode });
        if (!subject) {
          throw new Error("Subject not found (create subject)");
        }

        const courseSchemaDetails = await SubjectSchemaRelation.findOne({
          subjectId: subject._id,
        });
        if (!courseSchemaDetails) {
          throw new Error("Schema not found for the subject");
        }

        const schemaDetails = await Schema.findOne({
          _id: courseSchemaDetails.schemaId,
        });
        if (!schemaDetails) {
          throw new Error("Schema not found");
        }

        // Fetch all QuestionDefinitions for the schema
        // const questionDefinitions = await QuestionDefinition.find({
        // schemaId: schemaDetails.id,
        // });

        const questionDefinitions = await QuestionDefinition.find({
          _id: taskQuestionDefinitionId,
        });

        if (!questionDefinitions || questionDefinitions.length === 0) {
          throw new Error("No QuestionDefinitions found");
        }

        // Fetch Marks data from database based on the provided answerPdfId
        const marksData = await Marks.find({ answerPdfId: answerPdfId });

        // Create file data structure
        const fileData = {
          marks: [],
        };

        // Process each question definition and combine with marks data
        questionDefinitions.forEach((question, index) => {
          // Find the related Marks entry for the current questionDefinitionId
          const marks = marksData.find(
            (m) =>
              m.questionDefinitionId.toString() === question._id.toString(),
          );

          // Use marks data if exists, otherwise use defaults
          const marksInfo = marks
            ? {
                allottedMarks: marks.allottedMarks,
                timerStamps: marks.timerStamps,
                isMarked: marks.isMarked,
              }
            : {
                allottedMarks: 0,
                timerStamps: "",
                isMarked: false,
              };

          const marksDataObj = {
            _id: question._id.toString(),
            schemaId: question.schemaId,
            parentQuestionId: question.parentQuestionId || null,
            questionsName: question.questionsName,
            maxMarks: question.maxMarks || 10,
            minMarks: question.minMarks || 0,
            isSubQuestion: question.isSubQuestion || false,
            bonusMarks: question.bonusMarks || 0,
            marksDifference: question.marksDifference || 1,
            numberOfSubQuestions: question.numberOfSubQuestions || 0,
            compulsorySubQuestions: question.compulsorySubQuestions || 0,
            __v: question.__v || 0,
            allottedMarks: marksInfo.allottedMarks,
            answerPdfId: answerPdfId,
            timerStamps: marksInfo.timerStamps,
            isMarked: marksInfo.isMarked,
            updatedAt: new Date().toISOString(),
          };

          fileData.marks.push(marksDataObj);
          console.log(
            `✅ Processed question ${index + 1}: ${marksDataObj.questionsName}`,
          );
        });

        // Save to local file
        const existingData = loadMarksData(userId, answerPdfId, evaluatorId);

        if (!existingData.marks || existingData.marks.length === 0) {
          saveMarksData(userId, answerPdfId, fileData, evaluatorId);
        }
        console.log(
          `✅ Saved ${fileData.marks.length} questions to local file`,
        );

        const latestMarksData = loadMarksData(userId, answerPdfId, evaluatorId);

        // Emit back to the socket
        socket.emit("allquestions-data", {
          success: true,
          answerPdfId: answerPdfId,
          marks: latestMarksData.marks,
          status: "completed",
        });
      } catch (error) {
        console.error("Error in get-questions:", error);
        socket.emit("error", {
          success: false,
          message: error.message,
        });
      }
    });

    socket.on("get-marks-data", async (data) => {
      try {
        const { taskId, userId, answerPdfId } = data;

        const { evaluatorId, isHead } = await getEvaluatorContext(
          taskId,
          userId,
        );

        /* ========================================================= */
        /* 🔥 HEAD FLOW                                              */
        /* ========================================================= */

        // if (isHead) {
        //   const headMarks = await HeadMarks.find({
        //     answerPdfId,
        //     headEvaluatorId: userId,
        //   });

        //   return socket.emit("final-marks-data", {
        //     marks: headMarks,
        //     marksData: headMarks,
        //   });
        // }

        /* ========================================================= */
        /* ✅ NORMAL FLOW                                            */
        /* ========================================================= */

        const marksDataFile = loadMarksData(userId, answerPdfId, evaluatorId);
        const marksFile = loadMarks(userId, answerPdfId, evaluatorId);

        socket.emit("final-marks-data", {
          marks: marksFile.marks || [],
          marksData: marksDataFile.marks || [],
        });
      } catch (error) {
        console.error("Error in get-marks-data:", error);

        socket.emit("error", {
          success: false,
          message: error.message,
        });
      }
    });

    socket.on("fetch-reviewerData", async (data) => {
      try {
        const { evaluatorId, answerPdfId, page } = data;

        // ✅ DIRECTLY READ evaluator data
        const marksFile = loadMarks(evaluatorId, answerPdfId);
        const marksDataFile = loadMarksData(evaluatorId, answerPdfId);
        const fileData = loadData(evaluatorId, answerPdfId, page);

        // ✅ SEND only (NO COPYING)
        socket.emit("page-data-loaded", fileData);

        socket.emit("updated-marks-data", {
          marks: marksFile.marks || [],
          marksData: marksDataFile.marks || [],
        });
      } catch (error) {
        console.error("Error in fetch-reviewerData:", error);
      }
    });

    socket.on("delete-annotation-evaluatorFromReviewer", async (data) => {
      try {
        console.log("data for delete annotation of evaluator", data);

        const {
          taskId,
          answerPdfId,
          userId,
          evaluatorId,
          page,
          annotationIds,
          questionName,
          allottedMarks,
          parentQuestionId,
        } = data;

        console.log("data", data);
        console.log(`🗑️ Deleting annotation from task ${taskId}, page ${page}`);

        if (!userId || !answerPdfId || page === undefined || page === null) {
          console.error("❌ INVALID DELETE-ANNOTATION PAYLOAD", {
            taskId,
            userId,
            answerPdfId,
            page,
            annotationIds,
          });
          return; // 🔥 Block unsafe folder writes
        }

        const fileData = loadData(evaluatorId, answerPdfId, page);
        console.log("dataloaded", fileData);

        const idSet = new Set(annotationIds);
        const initialCount = fileData.annotations.length;

        // const questionName = fileData.annotations.find((a) =>
        //   idSet.has(a.id)
        // )?.questionsName;

        fileData.annotations = fileData.annotations.filter(
          (a) => !idSet.has(a.id),
        );
        const deletedCount = initialCount - fileData.annotations.length;

        console.log(
          `✅ Deleted ${deletedCount} annotation(s), remaining: ${fileData.annotations.length}`,
        );

        saveData(taskId, evaluatorId, answerPdfId, page, fileData);

        const marksData = loadMarks(evaluatorId, answerPdfId);
        console.log("marks data loaded for deletion");

        const existingMarksIndex = marksData.marks.findIndex(
          (mark) => mark.question === questionName,
        );

        if (existingMarksIndex !== -1) {
          // Question exists - add the new marks to existing marks
          const existingMarks =
            marksData.marks[existingMarksIndex].allottedMarks || 0;
          console.log("existingMarks", existingMarks);

          const newMarks = allottedMarks || 0;
          console.log("newMarks", newMarks);

          const totalMarks = existingMarks - newMarks;
          console.log("totalMarks", totalMarks);

          // Update only the allottedMarks field, keep all other fields
          marksData.marks[existingMarksIndex] = {
            ...marksData.marks[existingMarksIndex],
            allottedMarks: totalMarks, // Only update the allottedMarks with accumulated value
          };

          console.log(
            "✅ Updated allottedMarks in marks.json :",
            questionName,
            "Previous:",
            existingMarks,
            "Added:",
            newMarks,
            "Total:",
            totalMarks,
          );

          saveMarks(evaluatorId, answerPdfId, marksData);
        } else {
          console.log("❌ Question not found in questionMarksData.json:");
        }

        const questionMarksData = loadMarksData(evaluatorId, answerPdfId);
        const existingMarksId = questionMarksData.marks.findIndex(
          (mark) => mark.questionsName === String(questionName),
        );

        if (existingMarksId !== -1) {
          // Question exists - add the new marks to existing marks
          const existingMarks =
            questionMarksData.marks[existingMarksId].allottedMarks || 0;
          console.log("existingMarks", existingMarks);

          const newMarks = allottedMarks || 0;
          console.log("newMarks", newMarks);

          const totalMarks = existingMarks - newMarks;
          console.log("totalMarks", totalMarks);

          // Update only the allottedMarks field, keep all other fields
          questionMarksData.marks[existingMarksId] = {
            ...questionMarksData.marks[existingMarksId],
            allottedMarks: totalMarks, // Only update the allottedMarks with accumulated value
            isMarked: true, // Mark as marked
            updatedAt: new Date().toISOString(), // Update timestamp
          };

          console.log(
            "✅ Updated allottedMarks in questionMarksData.json for Question:",
            questionName,
            "Previous:",
            existingMarks,
            "Added:",
            newMarks,
            "Total:",
            totalMarks,
          );

          saveMarksData(evaluatorId, answerPdfId, questionMarksData);
        } else {
          console.log("❌ Question not found in questionMarksData.json:");
        }

        console.log("parentIndex for delete", parentQuestionId);

        if (parentQuestionId) {
          const parentIndex = questionMarksData.marks.findIndex(
            (m) => m._id === parentQuestionId,
          );
          console.log("parentIndex", parentIndex);

          if (parentIndex !== -1) {
            const existingMarks =
              questionMarksData.marks[parentIndex].allottedMarks || 0;
            console.log("existingMarks for parent", existingMarks);

            const newMarks = data.allottedMarks || 0;
            console.log("newMarks for parent", newMarks);

            const totalMarks = existingMarks - newMarks;
            console.log("totalMarks for parent", totalMarks);

            questionMarksData.marks[parentIndex] = {
              ...questionMarksData.marks[parentIndex],
              allottedMarks: totalMarks,
              isMarked: true,
              updatedAt: new Date().toISOString(),
            };
          }

          saveMarksData(evaluatorId, answerPdfId, questionMarksData);
          console.log(
            "questionMarksData after processing:",
            questionMarksData.marks[parentIndex],
          );
        }

        console.log("DELETE INPUT VALIDATION CHECK:", {
          userId,
          answerPdfId,
          page,
          typeUserId: typeof userId,
          typeAnswerPdfId: typeof answerPdfId,
          typePage: typeof page,
        });

        const filePath = getFilePath(
          evaluatorId,
          answerPdfId,
          page,
          socket.taskType,
        );
        console.log("filePath", filePath);

        const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

        const annotationsEmpty =
          !fileData.annotations || fileData.annotations.length === 0;
        const commentsEmpty =
          !fileData.comments || fileData.comments.length === 0;

        const status =
          annotationsEmpty && commentsEmpty ? "visited" : "submitted";

        console.log("📌 FINAL STATUS:", status);

        const roomName =
          socket.taskType === "booklet"
            ? `booklet_${taskId}`
            : `task_${taskId}`;
        io.to(roomName).emit(
          "annotations-deleted",
          {
            ...fileData,
          },
          { status: status },
        );
        console.log("DEBUG → page:", page);
        console.log("DEBUG → trying to update:", `image_${page}.png`);

        try {
          // Try multiple approaches to find the document
          let result;

          if (socket.taskType === "booklet") {
            result = await BookletAnswerPdfImage.updateOne(
              {
                $or: [
                  { bookletAnswerPdfId: answerPdfId },
                  {
                    bookletAnswerPdfId: new mongoose.Types.ObjectId(
                      answerPdfId,
                    ),
                  },
                ],
                name: { $regex: `image_${page}`, $options: "i" },
              },
              {
                $set: {
                  status: status,
                  updatedAt: new Date(),
                },
              },
            );
          } else {
            result = await AnswerPdfImage.updateOne(
              {
                $or: [
                  { answerPdfId: answerPdfId },
                  { answerPdfId: new mongoose.Types.ObjectId(answerPdfId) },
                ],
                name: { $regex: `image_${page}`, $options: "i" },
              },
              {
                $set: {
                  status: status,
                  updatedAt: new Date(),
                },
              },
            );
          }

          emitMarksUpdate(io, taskId, evaluatorId, answerPdfId);
          console.log("Done");

          console.log(
            `✅ DB Update - Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
          );

          if (result.matchedCount === 0) {
            console.log("⚠️  No documents matched the criteria");
          }

          return result;
        } catch (error) {
          console.error("❌ Database update error:", error);
        }
      } catch (error) {
        console.error("Error in delete-annotation:", error);
      }
    });

    socket.on("leave-room", ({ taskId }) => {
      const roomName =
        socket.taskType === "booklet" ? `booklet_${taskId}` : `task_${taskId}`;
      socket.leave(roomName);
      console.log(`🔴 Client ${socket.id} left room: ${roomName}`);
    });

    const emitMarksUpdate = async (io, taskId, userId, answerPdfId) => {
      const { evaluatorId, isHead } = await getEvaluatorContext(taskId, userId);

      let marksFile = { marks: [] };
      let marksDataFile = { marks: [] };

      marksDataFile = loadMarksData(userId, answerPdfId, evaluatorId);
      marksFile = loadMarks(userId, answerPdfId, evaluatorId);

      const roomName =
        socket.taskType === "booklet" ? `booklet_${taskId}` : `task_${taskId}`;

      io.to(roomName).emit("updated-marks-data", {
        marks: marksFile.marks || [],
        marksData: marksDataFile.marks || [],
      });
    };

    socket.on("disconnect", (reason) => {
      console.log("🔴 Client disconnected:", socket.id, "Reason:", reason);
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
  });
}
