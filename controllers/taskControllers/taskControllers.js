import fs from "fs";
import path from "path";
import Task from "../../models/taskModels/taskModel.js";
import { io } from "../../server.js";
import { isValidObjectId } from "../../services/mongoIdValidation.js";
import User from "../../models/authModels/User.js";
import SubjectSchemaRelation from "../../models/subjectSchemaRelationModel/subjectSchemaRelationModel.js";
import BookletReassignment from "../../models/taskModels/bookletReassignmentModel.js";
import AnswerPdf from "../../models/EvaluationModels/studentAnswerPdf.js";
import Schema from "../../models/schemeModel/schema.js";
import sharp from "sharp";

import BookletTask from "../../models/taskModels/bookletTaskModel.js";
import BookletAnswerPdf from "../../models/EvaluationModels/bookletAnswerPdfModel.js";
import BookletAnswerPdfImage from "../../models/EvaluationModels/bookletAnswerPdfImageModel.js";
import BookletMarks from "../../models/EvaluationModels/bookletMarksModel.js";
import BookletIcon from "../../models/EvaluationModels/bookletIconModel.js";

import QuestionDefinition from "../../models/schemeModel/questionDefinitionSchema.js";
import mongoose from "mongoose";
import extractImagesFromPdf from "./extractImagesFromPDF.js";
import AnswerPdfImage from "../../models/EvaluationModels/answerPdfImageModel.js";
import Marks from "../../models/EvaluationModels/marksModel.js";
import { __dirname } from "../../server.js";
import Subject from "../../models/classModel/subjectModel.js";
import SubjectFolderModel from "../../models/StudentModels/subjectFolderModel.js";
import Icon from "../../models/EvaluationModels/iconModel.js";
import { subjectsWithTasks } from "../classControllers/subjectControllers.js";
import ReviewerTask from "../../models/taskModels/reviewerTaskModel.js";

import ScannerTask from "../../models/taskModels/scannerTaskModel.js";
import CourseSchemaRelation from "../../models/subjectSchemaRelationModel/subjectSchemaRelationModel.js";

// import { ConversationsMessageFile } from "sib-api-v3-sdk";
const extractQuestionImages = async (
  coordinates,
  pageImages,
  pageImagesFolder,
  outputFolder,
) => {
  console.log(
    "Starting question image extraction — total pages in DB:",
    pageImages.length,
  );

  if (pageImages.length === 0) {
    console.warn("No pages received → extraction will be empty");
    return [];
  }

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const results = [];

  const findRecordByPage = (pageNum) =>
    pageImages.find((r) => Number(r.page) === Number(pageNum));

  // ── WHOLE PAGES ──────────────────────────────────────────────
  if (Array.isArray(coordinates.wholePages)) {
    for (const pageNum of coordinates.wholePages) {
      const pageRecord = findRecordByPage(pageNum);
      if (!pageRecord?.name) continue;

      const source = path.join(pageImagesFolder, pageRecord.name);
      if (!fs.existsSync(source)) continue;

      const targetName = `image_${pageNum}.png`;
      const targetPath = path.join(outputFolder, targetName);
      const tempPath = path.join(outputFolder, `.__tmp_${pageNum}.png`);

      try {
        await sharp(source).toFile(tempPath);
        fs.renameSync(tempPath, targetPath); // 🔒 atomic replace

        results.push({
          type: "whole",
          page: pageNum,
          image: targetName,
          originalImage: pageRecord.name,
        });

        console.log(`Whole page ${pageNum} written safely`);
      } catch (err) {
        console.error(`Whole page ${pageNum} failed:`, err.message);
      }
    }
  }

  // ── PARTIAL AREAS ────────────────────────────────────────────
  if (
    coordinates.partialAreas &&
    typeof coordinates.partialAreas === "object"
  ) {
    for (const [pageKey, areas] of Object.entries(coordinates.partialAreas)) {
      const pageNum = Number(pageKey);
      if (isNaN(pageNum)) continue;

      const pageRecord = findRecordByPage(pageNum);
      if (!pageRecord?.name) continue;

      const source = path.join(pageImagesFolder, pageRecord.name);
      if (!fs.existsSync(source)) continue;

      for (let i = 0; i < areas.length; i++) {
        const { x, y, width, height } = areas[i];
        if ([x, y, width, height].some((v) => v <= 0)) continue;

        const targetName = `image_${pageNum}.png`;
        const targetPath = path.join(outputFolder, targetName);
        const tempPath = path.join(outputFolder, `.__tmp_${pageNum}_${i}.png`);

        try {
          await sharp(source)
            .extract({
              left: Math.round(x),
              top: Math.round(y),
              width: Math.round(width),
              height: Math.round(height),
            })
            .toFile(tempPath);

          fs.renameSync(tempPath, targetPath); // 🔒 safe overwrite

          results.push({
            type: "partial",
            page: pageNum,
            areaIndex: i + 1,
            image: targetName,
            coordinates: { x, y, width, height },
            originalImage: pageRecord.name,
          });

          console.log(`Page ${pageNum} area ${i + 1} written safely`);
        } catch (err) {
          console.error(`Page ${pageNum} area ${i + 1} failed:`, err.message);
        }
      }
    }
  }

  console.log(
    `Question image extraction finished — created ${results.length} files`,
  );
  return results;
};

// const extractQuestionImages = async (
//   coordinates,
//   pageImages, // array of documents from DB
//   pageImagesFolder,
//   outputFolder,
// ) => {
//   console.log(
//     "Starting question image extraction — total pages in DB:",
//     pageImages.length,
//   );

//   // Debug: show exactly what we received
//   console.log("Received pageImages contents:");
//   pageImages.forEach((img, index) => {
//     console.log(
//       `  index ${index}: page=${img.page} (${typeof img.page}), name=${img.name || "(missing name)"}`,
//     );
//   });

//   if (pageImages.length === 0) {
//     console.warn("No pages received → extraction will be empty");
//     return [];
//   }

//   if (!fs.existsSync(outputFolder)) {
//     fs.mkdirSync(outputFolder, { recursive: true });
//   }

//   const results = [];

//   // SAFE LOOKUP: find document by its page number
//   const findRecordByPage = (pageNum) =>
//     pageImages.find((record) => Number(record.page) === Number(pageNum));

//   // ── WHOLE PAGES ─────────────────────────────────────────────────────
//   if (
//     Array.isArray(coordinates.wholePages) &&
//     coordinates.wholePages.length > 0
//   ) {
//     for (const pageNum of coordinates.wholePages) {
//       const pageRecord = findRecordByPage(pageNum);
//       if (!pageRecord || !pageRecord.name) {
//         console.warn(`Whole page ${pageNum} → no matching record`);
//         continue;
//       }

//       const source = path.join(pageImagesFolder, pageRecord.name);
//       if (!fs.existsSync(source)) {
//         console.error(`Whole page ${pageNum} source missing: ${source}`);
//         continue;
//       }

//       const targetName = `image_${pageNum}.png`;
//       const targetPath = path.join(outputFolder, targetName);

//       try {
//         await sharp(source).toFile(targetPath);
//         console.log(`Whole page ${pageNum} → ${targetName}`);
//         results.push({
//           type: "whole",
//           page: pageNum,
//           image: targetName,
//           originalImage: pageRecord.name,
//         });
//       } catch (err) {
//         console.error(`Whole page ${pageNum} failed: ${err.message}`);
//       }
//     }
//   }

//   // ── PARTIAL AREAS ───────────────────────────────────────────────────
//   if (
//     coordinates.partialAreas &&
//     typeof coordinates.partialAreas === "object"
//   ) {
//     for (const [pageKey, areas] of Object.entries(coordinates.partialAreas)) {
//       const pageNum = Number(pageKey);
//       if (isNaN(pageNum)) continue;

//       const pageRecord = findRecordByPage(pageNum);
//       if (!pageRecord || !pageRecord.name) {
//         console.warn(`Partial page ${pageNum} → no matching record`);
//         continue;
//       }

//       const source = path.join(pageImagesFolder, pageRecord.name);
//       if (!fs.existsSync(source)) {
//         console.error(`Partial page ${pageNum} source missing: ${source}`);
//         continue;
//       }

//       const sharpSrc = sharp(source);

//       for (let i = 0; i < areas.length; i++) {
//         const { x, y, width, height } = areas[i];

//         if ([x, y, width, height].some((v) => v == null || v <= 0)) {
//           console.warn(`Invalid coords on page ${pageNum} area ${i + 1}`);
//           continue;
//         }

//         const targetName = `image_${pageNum}.png`;
//         const targetPath = path.join(outputFolder, targetName);

//         try {
//           await sharpSrc
//             .clone()
//             .extract({
//               left: Math.round(x),
//               top: Math.round(y),
//               width: Math.round(width),
//               height: Math.round(height),
//             })
//             .toFile(targetPath);

//           console.log(`Page ${pageNum} area ${i + 1} → ${targetName}`);

//           results.push({
//             type: "partial",
//             page: pageNum,
//             areaIndex: i + 1,
//             image: targetName,
//             coordinates: { x, y, width, height },
//             originalImage: pageRecord.name,
//           });
//         } catch (err) {
//           console.error(`Page ${pageNum} area ${i + 1} failed: ${err.message}`);
//         }
//       }
//     }
//   }

//   console.log(
//     `Question image extraction finished — created ${results.length} files`,
//   );
//   return results;
// };

//   coordinates,
//   pageImages,
//   pageImagesFolder,
//   outputFolder
// ) => {
//   if (!fs.existsSync(outputFolder)) {
//     fs.mkdirSync(outputFolder, { recursive: true });
//   }

//   const results = [];
//   let imageCounter = 1; // 🔥 GLOBAL COUNTER

//   // Helper to find page image safely
//   const findPageImage = (page) =>
//     pageImages.find(img =>
//       img.name.match(new RegExp(`page-0*${page}\\.png$`))
//     );

//   /* ================= WHOLE PAGES ================= */
//   if (Array.isArray(coordinates.wholePages)) {
//     for (const page of coordinates.wholePages) {
//       const pageImage = findPageImage(page);
//       if (!pageImage) {
//         console.warn(`⚠️ Page ${page}: image not found`);
//         continue;
//       }

//       const sourcePath = path.join(pageImagesFolder, pageImage.name);
//       const outputName = `image_${imageCounter}.png`;
//       const outputPath = path.join(outputFolder, outputName);

//       await sharp(sourcePath).toFile(outputPath);

//       results.push({
//         type: "whole",
//         page,
//         image: outputName,
//       });

//       imageCounter++; // ✅ increment
//     }
//   }

//   /* ================= PARTIAL AREAS ================= */
//   if (coordinates.partialAreas) {
//     for (const [pageStr, areas] of Object.entries(coordinates.partialAreas)) {
//       const page = Number(pageStr);
//       const pageImage = findPageImage(page);
//       if (!pageImage) {
//         console.warn(`⚠️ Page ${page}: image not found`);
//         continue;
//       }

//       const sourcePath = path.join(pageImagesFolder, pageImage.name);

//       for (const area of areas) {
//         const { x, y, width, height } = area;
//         if (width <= 0 || height <= 0) continue;

//         const outputName = `image_${imageCounter}.png`;
//         const outputPath = path.join(outputFolder, outputName);

//         await sharp(sourcePath)
//           .extract({
//             left: Math.round(x),
//             top: Math.round(y),
//             width: Math.round(width),
//             height: Math.round(height),
//           })
//           .toFile(outputPath);

//         results.push({
//           type: "partial",
//           page,
//           image: outputName,
//         });

//         imageCounter++; // ✅ increment
//       }
//     }
//   }

//   console.log(`📊 Total question images extracted: ${results.length}`);
//   return results;
// };

// const assigningTask = async (req, res) => {
//   const { userId, subjectCode, questiondefinitionId, bookletsToAssign } =
//     req.body;
//   console.log(
//     "userId,  subjectCode,questionDefinitionId, bookletsToAssign",
//     userId,
//     subjectCode,
//     questiondefinitionId,
//     bookletsToAssign,
//   );

//   const session = await mongoose.startSession();

//   try {
//     session.startTransaction();

//     if (!userId || !subjectCode || !questiondefinitionId || !bookletsToAssign) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     if (!isValidObjectId(userId)) {
//       return res.status(400).json({ message: "Invalid user ID." });
//     }

//     const user = await User.findById(userId);

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const subjectCodes = user.subjectCode;

//     if (!subjectCodes || subjectCodes.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No subjects found for the user." });
//     }

//     const subjectDetails = await Subject.find({ _id: { $in: subjectCodes } });
//     // console.log("subjectDetails", subjectDetails);

//     // If no subjects found
//     if (subjectDetails.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No subjects found for the given IDs." });
//     }

//     // Check if the subject code exists
//     const subject = subjectDetails.find(
//       (subject) => subject.code === subjectCode,
//     );

//     if (!subject) {
//       return res.status(404).json({
//         message: "Subject not found (upload master and question booklet).",
//       });
//     }

//     // Check if the folder for the subject code exists
//     const rootFolder = path.join(__dirname, "processedFolder");
//     const subjectFolder = path.join(rootFolder, subjectCode);

//     if (!fs.existsSync(subjectFolder)) {
//       return res.status(404).json({ message: "Subject folder not found." });
//     }

//     // Get all PDFs in the folder
//     const allPdfs = fs
//       .readdirSync(subjectFolder)
//       .filter((file) => file.endsWith(".pdf"));

//     // Get already assigned PDFs for this subjectCode
//     // const assignedPdfs = await AnswerPdf.find({
//     //   taskId: { $in: await Task.find({ subjectCode }).select("_id") },
//     // });

//     // const assignedPdfNames = assignedPdfs.map((pdf) => pdf.answerPdfName);

//     // // Find unassigned PDFs
//     // const unassignedPdfs = allPdfs.filter(
//     //   (pdf) => !assignedPdfNames.includes(pdf)
//     // );

//     // if (unassignedPdfs.length === 0) {
//     //   return res
//     //     .status(400)
//     //     .json({ message: "All booklets are already assigned." });
//     // }
//     // SAME PDF CAN BE ASSIGNED TO MULTIPLE EVALUATORS

//     const taskIds = await Task.find({ userId }).distinct("_id");

//     console.log("taskIds", taskIds);

//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);

//     const endOfDay = new Date();
//     endOfDay.setHours(23, 59, 59, 999);

//     const todayPending = await AnswerPdf.countDocuments({
//       taskId: { $in: taskIds },
//       status: "false",
//       assignedDate: { $gte: startOfDay, $lte: endOfDay },
//     }).session(session);

//     // validate total assignment limit
//     // if (previouslyAssigned + Number(bookletsToAssign) > user.maxBooklets) {
//     //   return res.status(400).json({
//     //     message: `User can be assigned maximum ${user.maxBooklets} booklets. Already assigned ${previouslyAssigned}, requested ${bookletsToAssign}.`,
//     //   });
//     // }

//     const dailyLimit = user.maxBooklets; // per-day limit
//     const availableToday = Math.max(0, dailyLimit - todayPending);

//     if (Number(bookletsToAssign) > availableToday) {
//       return res.status(400).json({
//         message: `Daily limit exceeded. Available today: ${availableToday}, requested: ${bookletsToAssign}`,
//       });
//     }

//     console.log("allpdfs", allPdfs.length);

//     const pdfsToBeAssigned = allPdfs.slice(0, bookletsToAssign);

//     console.log("pdfsToBeAssigned", pdfsToBeAssigned.length);

//     if (pdfsToBeAssigned.length === 0) {
//       return res.status(400).json({ message: "No PDFs found to assign." });
//     }

//     // Determine the number of PDFs to assign in this request

//     // Create a new task for this assignment
//     let task = await Task.findOne({
//       userId: user._id,
//       subjectCode,
//     }).session(session);

//     // If NO existing task → create one
//     // if (!task) {
//     //   task = new Task({
//     //     subjectCode,
//     //     userId: user._id,
//     //     questionDefinitionId: questionDefinitionId,
//     //     totalBooklets: 0,
//     //     status: "inactive",
//     //     currentFileIndex: 1,
//     //   });

//     //   await task.save({ session });
//     // }
//     if (task) {
//       task.questiondefinitionId = questiondefinitionId; // ✅ FIX
//     } else {
//       task = new Task({
//         subjectCode,
//         userId: user._id,
//         questiondefinitionId,
//         totalBooklets: 0,
//         status: "inactive",
//         currentFileIndex: 1,
//       });
//     }

//     await task.save({ session });

//     // Increase task booklet count
//     task.totalBooklets += pdfsToBeAssigned.length;
//     await task.save({ session });

//     // Save the assigned PDFs in the AnswerPdf model
//     const answerPdfDocs = pdfsToBeAssigned.map((pdf) => ({
//       taskId: task._id,
//       answerPdfName: pdf,
//       status: "false",
//       assignedDate: new Date(),
//     }));

//     await AnswerPdf.insertMany(answerPdfDocs, { session });

//     // =========================
//     //   GLOBAL COUNTS LOGIC
//     // =========================

//     // 1️⃣ All tasks created for this subject (GLOBAL)
//     const subjectTaskIds = await Task.find({ subjectCode })
//       .session(session)
//       .distinct("_id");

//     const allocated = await AnswerPdf.countDocuments({
//       taskId: { $in: subjectTaskIds },
//     }).session(session);
//     console.log("GLOBAL allocated:", allocated);

//     // 3️⃣ evaluation_pending = ALL PDFs where status:false (GLOBAL)
//     const evaluation_pending = await AnswerPdf.countDocuments({
//       taskId: { $in: subjectTaskIds },
//       status: "false",
//     }).session(session);

//     // 4️⃣ evaluated = ALL PDFs where status:true (GLOBAL)
//     const evaluated = await AnswerPdf.countDocuments({
//       taskId: { $in: subjectTaskIds },
//       status: "true",
//     }).session(session);

//     // 5️⃣ unAllocated = total PDFs - allocated
//     let unAllocated = allPdfs.length - allocated;
//     if (unAllocated < 0) unAllocated = 0;

//     console.log("GLOBAL allocated:", allocated);
//     console.log("GLOBAL evaluation_pending:", evaluation_pending);
//     console.log("GLOBAL evaluated:", evaluated);
//     console.log("GLOBAL unAllocated:", unAllocated);

//     // 6️⃣ Update subject folder document
//     await SubjectFolderModel.findOneAndUpdate(
//       { folderName: subjectCode },
//       {
//         $set: {
//           allocated,
//           evaluation_pending,
//           evaluated,
//           unAllocated,
//           updatedAt: new Date(),
//         },
//       },
//       { session },
//     );

//     await session.commitTransaction();

//     return res.status(201).json({
//       message: `${pdfsToBeAssigned.length} Booklets assigned successfully.`,
//       assignedPdfs: pdfsToBeAssigned,
//     });
//   } catch (error) {
//     session.endSession();
//     console.error("Error assigning task:", error);
//     return res
//       .status(500)
//       .json({ error: "An error occurred while assigning the task." });
//   }
// };

const assigningTaskWorkers = async (jobs) => {
  try {
    for (const job of jobs) {
      const { userId, subjectCode, questiondefinitionId, taskId } = job;

      console.log("🔄 Background processing started for:", {
        userId,
        subjectCode,
        questiondefinitionId,
        taskId,
      });

      // 🔹 1. Fetch task
      const task = await Task.findById(taskId);
      if (!task) {
        console.warn(`Task not found: ${taskId}`);
        continue;
      }

      // 🔹 2. Fetch subject + schema
      const subject = await Subject.findOne({ code: subjectCode });
      if (!subject) {
        console.warn(`Subject not found: ${subjectCode}`);
        continue;
      }

      const courseSchemaRel = await SubjectSchemaRelation.findOne({
        subjectId: subject._id,
      });
      if (!courseSchemaRel) {
        console.warn("Schema relation not found");
        continue;
      }

      const schemaDetails = await Schema.findById(courseSchemaRel.schemaId);
      if (!schemaDetails) {
        console.warn("Schema not found");
        continue;
      }

      // 🔹 3. Folder paths
      const rootFolder = path.join(__dirname, "processedFolder");
      const subjectFolder = path.join(rootFolder, task.subjectCode);
      if (!fs.existsSync(subjectFolder)) {
        console.warn(`Subject folder missing: ${subjectFolder}`);
        continue;
      }

      const extractedBookletsFolder = path.join(
        subjectFolder,
        "extractedBooklets",
      );
      if (!fs.existsSync(extractedBookletsFolder)) {
        fs.mkdirSync(extractedBookletsFolder, { recursive: true });
      }

      // 🔹 4. Get assigned PDFs for this task
      const assignedPdfs = await AnswerPdf.find({
        taskId: task._id,
        questiondefinitionId,
      });

      if (!assignedPdfs.length) {
        console.warn(`No PDFs assigned for task ${taskId}`);
        continue;
      }

      // 🔹 5. Extract images PDF by PDF
      const questionDef =
        await QuestionDefinition.findById(questiondefinitionId);

      const questionPages = new Set(questionDef.page);

      for (const pdfDoc of assignedPdfs) {
        const pdfPath = path.join(subjectFolder, pdfDoc.answerPdfName);
        if (!fs.existsSync(pdfPath)) continue;

        const bookletName = path.basename(pdfDoc.answerPdfName, ".pdf");
        const bookletFolder = path.join(extractedBookletsFolder, bookletName);
        fs.mkdirSync(bookletFolder, { recursive: true });

        console.log(`📤 Extracting images from ${pdfDoc.answerPdfName}`);

        const alreadyExtracted = await AnswerPdfImage.exists({
          answerPdfId: pdfDoc._id,
          questiondefinitionId,
        });

        if (alreadyExtracted) {
          console.log(
            `⏭️ Images already extracted for ${pdfDoc.answerPdfName}, skipping`,
          );
          continue;
        }

        // 🔐 Filesystem lock (SECOND)
        const lockFile = path.join(bookletFolder, ".extract.lock");
        if (fs.existsSync(lockFile)) {
          console.log(
            `🔒 Extraction already in progress for ${pdfDoc.answerPdfName}`,
          );
          continue;
        }
        fs.writeFileSync(lockFile, "LOCK");
        try {
          console.log(`📤 Extracting images from ${pdfDoc.answerPdfName}`);

          const imageFiles = await extractImagesFromPdf(pdfPath, bookletFolder);

          const imageDocs = imageFiles
            .map((img) => {
              const match = img.match(/image_(\d+)\.png$/);
              if (!match) return null;

              const pageNumber = parseInt(match[1], 10);
              if (!questionPages.has(pageNumber)) return null;

              return {
                answerPdfId: pdfDoc._id,
                questiondefinitionId,
                name: img,
                page: pageNumber,
                status: "notVisited",
              };
            })
            .filter(Boolean);

          if (imageDocs.length) {
            await AnswerPdfImage.insertMany(imageDocs);
          }
        } finally {
          // 🔓 Always release lock
          if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
          }
        }
      }

      console.log(`✅ Completed extraction for task ${taskId}`);
    }

    console.log("🎉 Background assignment worker finished successfully");
  } catch (err) {
    console.error("❌ Background worker failed:", err);
  }
};

const assigningTask = async (req, res) => {
  // 1. Extract the assignments array from the new payload structure
  const { assignments } = req.body;

  console.log("assognments", assignments);

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ message: "No assignments data provided." });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Track assigned PDFs across all users in this request to return in response
    const allAssignedInThisRequest = [];
    // Store the subjectCode from the first assignment (assuming batch is same subject)
    // If subjects differ per assignment, move folder logic inside the loop
    const primarySubjectCode = assignments[0].subjectCode;
    const backgroundJobs = [];

    // 2. Loop through each assignment in the payload
    for (const item of assignments) {
      const { userId, subjectCode, questiondefinitionId, bookletsToAssign } =
        item;

      // Basic validation for each item
      if (
        !userId ||
        !subjectCode ||
        !questiondefinitionId ||
        bookletsToAssign === undefined
      ) {
        throw new Error(`Missing fields for user: ${userId}`);
      }

      const user = await User.findById(userId).session(session);
      if (!user) throw new Error(`User not found: ${userId}`);

      // Folder and PDF logic (Assuming files are in processedFolder/subjectCode)
      const subjectFolder = path.join(
        __dirname,
        "processedFolder",
        subjectCode,
      );
      if (!fs.existsSync(subjectFolder)) {
        throw new Error(`Subject folder not found for ${subjectCode}`);
      }

      const allPdfs = fs
        .readdirSync(subjectFolder)
        .filter((file) => file.endsWith(".pdf"));

      // 3. Daily Limit Validation
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const taskIds = await Task.find({ userId })
        .distinct("_id")
        .session(session);

      const todayPending = await AnswerPdf.countDocuments({
        taskId: { $in: taskIds },
        status: "false",
        assignedDate: { $gte: startOfDay, $lte: endOfDay },
      }).session(session);

      const availableToday = Math.max(0, user.maxBooklets - todayPending);
      if (Number(bookletsToAssign) > availableToday) {
        throw new Error(
          `Daily limit exceeded for user ${user.email}. Available: ${availableToday}`,
        );
      }

      // 4. PDF Selection
      // Note: If you want to ensure the SAME PDF isn't assigned to the SAME user twice,
      // you may need to filter 'allPdfs' based on existing AnswerPdf records.
      const pdfsToBeAssigned = allPdfs.slice(0, bookletsToAssign);
      if (pdfsToBeAssigned.length === 0) {
        throw new Error(`No PDFs found to assign for subject ${subjectCode}`);
      }

      // 5. Task Upsert
      let task = await Task.findOne({
        userId,
        subjectCode,
        questiondefinitionId,
      }).session(session);
      if (task) {
        task.questiondefinitionId = questiondefinitionId;
        task.totalBooklets += pdfsToBeAssigned.length;
        task.status = "inactive";
      } else {
        task = new Task({
          subjectCode,
          userId,
          questiondefinitionId,
          totalBooklets: pdfsToBeAssigned.length,
          status: "inactive",
          currentFileIndex: 1,
        });
      }
      await task.save({ session });

      // 6. Create AnswerPdf Records
      const answerPdfDocs = pdfsToBeAssigned.map((pdf) => ({
        taskId: task._id,
        answerPdfName: pdf,
        questiondefinitionId: task.questiondefinitionId,
        status: "false",
        assignedDate: new Date(),
      }));

      await AnswerPdf.insertMany(answerPdfDocs, { session });
      allAssignedInThisRequest.push(...pdfsToBeAssigned);

      backgroundJobs.push({
        userId,
        subjectCode,
        questiondefinitionId,
        taskId: task._id,
      });
    }

    // 7. Update Global Counts (Outside the loop for efficiency)
    // We update based on the primarySubjectCode from the batch
    const subjectTaskIds = await Task.find({ subjectCode: primarySubjectCode })
      .session(session)
      .distinct("_id");

    console.log("subject Task Id", subjectTaskIds);

    // const allocated = await AnswerPdf.countDocuments({
    //   taskId: { $in: subjectTaskIds },
    // }).session(session);

    // const allocatedAgg = await AnswerPdf.aggregate([
    //   {
    //     $match: {
    //       taskId: { $in: subjectTaskIds },
    //     },
    //   },
    //   {
    //     $group: {
    //       _id: "$answerPdfName", // 🔑 DISTINCT PDF NAME
    //     },
    //   },
    //   {
    //     $count: "allocated",
    //   },
    // ]);

    // const allocated = allocatedAgg[0]?.allocated || 0;

    const allocated = (
      await AnswerPdf.distinct("answerPdfName", {
        taskId: { $in: subjectTaskIds },
      }).session(session)
    ).length;

    console.log("allocated", allocated);

    const evaluationPendingAgg = await AnswerPdf.aggregate([
      {
        $match: {
          taskId: { $in: subjectTaskIds },
          status: "false",
        },
      },
      {
        $group: {
          _id: "$answerPdfName",
        },
      },
      {
        $count: "evaluation_pending",
      },
    ]).session(session);

    const evaluation_pending = evaluationPendingAgg[0]?.evaluation_pending || 0;
    console.log("evaluatedpending", evaluation_pending);

    const evaluatedAgg = await AnswerPdf.aggregate([
      {
        $match: {
          taskId: { $in: subjectTaskIds },
          status: "true",
        },
      },
      {
        $group: {
          _id: "$answerPdfName",
        },
      },
      {
        $count: "evaluated",
      },
    ]).session(session);

    const evaluated = evaluatedAgg[0]?.evaluated || 0;

    // Get folder count again for unAllocated math
    const primaryFolder = path.join(
      __dirname,
      "processedFolder",
      primarySubjectCode,
    );
    const totalFiles = fs
      .readdirSync(primaryFolder)
      .filter((f) => f.endsWith(".pdf")).length;
    console.log("Total files are", totalFiles);

    await SubjectFolderModel.findOneAndUpdate(
      { folderName: primarySubjectCode },
      {
        $set: {
          allocated,
          evaluation_pending,
          evaluated,
          unAllocated: Math.max(0, totalFiles - allocated),
          updatedAt: new Date(),
        },
      },
      { session },
    );

    await session.commitTransaction();
    res.status(201).json({
      message: "Batch assignment successful",
      assignedCount: allAssignedInThisRequest.length,
    });

    setImmediate(() => {
      assigningTaskWorkers(backgroundJobs);
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error assigning task:", error);
    res.status(500).json({ error: error.message || "An error occurred." });
  } finally {
    session.endSession();
  }
};

const assignBookletWiseTask = async (req, res) => {
  try {
    const { userId, subjectCode, bookletsToAssign } = req.body;

    if (!userId || !subjectCode || !bookletsToAssign) {
      return res.status(400).json({ message: "All fields required" });
    }

    const subjectFolder = path.join(__dirname, "processedFolder", subjectCode);

    if (!fs.existsSync(subjectFolder)) {
      return res.status(404).json({ message: "Subject folder not found" });
    }

    const allPdfs = fs
      .readdirSync(subjectFolder)
      .filter((f) => f.endsWith(".pdf"));

    if (!allPdfs.length) {
      return res.status(400).json({ message: "No PDFs available" });
    }

    const pdfsToAssign = allPdfs.slice(0, Number(bookletsToAssign));

    if (!pdfsToAssign.length) {
      return res.status(400).json({ message: "No PDFs selected to assign" });
    }

    /* ---------------- CREATE TASK ---------------- */

    const bookletTask = new BookletTask({
      subjectCode,
      userId,
      totalBooklets: pdfsToAssign.length,
      status: "inactive",
      currentFileIndex: 1,
      taskType: "booklet",
    });

    await bookletTask.save();

    /* ---------------- CREATE ANSWER PDF DOCS ---------------- */

    const bookletDocsPayload = pdfsToAssign.map((pdf) => ({
      bookletTaskId: bookletTask._id,
      answerPdfName: pdf,
      assignedDate: new Date(),
      status: "false",
    }));

    const insertedBookletDocs =
      await BookletAnswerPdf.insertMany(bookletDocsPayload);

    /* ---------------------------------------------------- */
    /* 📊 UPDATE SUBJECT FOLDER COUNTS (BOOKLET WISE)      */
    /* ---------------------------------------------------- */

    // 1️⃣ Get all booklet task IDs for this subject
    const subjectTaskIds = await BookletTask.find({ subjectCode }).distinct(
      "_id",
    );

    // 2️⃣ allocated (distinct booklet names)
    const allocated = (
      await BookletAnswerPdf.distinct("answerPdfName", {
        bookletTaskId: { $in: subjectTaskIds },
      })
    ).length;

    // 3️⃣ evaluation_pending
    const evaluationPendingAgg = await BookletAnswerPdf.aggregate([
      {
        $match: {
          bookletTaskId: { $in: subjectTaskIds },
          status: "false",
        },
      },
      {
        $group: { _id: "$answerPdfName" },
      },
      {
        $count: "evaluation_pending",
      },
    ]);

    const evaluation_pending = evaluationPendingAgg[0]?.evaluation_pending || 0;

    // 4️⃣ evaluated
    const evaluatedAgg = await BookletAnswerPdf.aggregate([
      {
        $match: {
          bookletTaskId: { $in: subjectTaskIds },
          status: "true",
        },
      },
      {
        $group: { _id: "$answerPdfName" },
      },
      {
        $count: "evaluated",
      },
    ]);

    const evaluated = evaluatedAgg[0]?.evaluated || 0;

    // 5️⃣ total PDFs in folder
    const totalFiles = allPdfs.length;

    // 6️⃣ unAllocated
    const unAllocated = Math.max(0, totalFiles - allocated);

    // 7️⃣ Update subject folder
    await SubjectFolderModel.findOneAndUpdate(
      { folderName: subjectCode },
      {
        $set: {
          allocated,
          evaluation_pending,
          evaluated,
          unAllocated,
          updatedAt: new Date(),
        },
      },
    );

    /* ---------------- SEND RESPONSE IMMEDIATELY ---------------- */

    res.status(201).json({
      success: true,
      message: "Booklet-wise task created successfully",
      taskId: bookletTask._id,
      totalAssigned: insertedBookletDocs.length,
    });

    /* ===================================================== */
    /* 🚀 BACKGROUND IMAGE EXTRACTION STARTS HERE          */
    /* ===================================================== */

    setImmediate(async () => {
      console.log("🚀 Background extraction started...");

      for (const pdfDoc of insertedBookletDocs) {
        try {
          const pdfPath = path.join(subjectFolder, pdfDoc.answerPdfName);

          if (!fs.existsSync(pdfPath)) {
            console.warn(`PDF not found: ${pdfDoc.answerPdfName}`);
            continue;
          }

          const extractedFolder = path.join(
            subjectFolder,
            "bookletWiseExtracted",
            pdfDoc.answerPdfName.replace(".pdf", ""),
          );

          fs.mkdirSync(extractedFolder, { recursive: true });

          console.log(`📤 Extracting images from ${pdfDoc.answerPdfName}`);

          const imageFiles = await extractImagesFromPdf(
            pdfPath,
            extractedFolder,
          );

          if (!imageFiles || !imageFiles.length) {
            console.warn("No images extracted");
            continue;
          }

          const imageDocs = imageFiles.map((img) => {
            const match = img.match(/image_(\d+)\.png$/);

            return {
              bookletAnswerPdfId: pdfDoc._id,
              name: img,
              page: match ? parseInt(match[1], 10) : 1,
              status: "notVisited",
            };
          });

          await BookletAnswerPdfImage.insertMany(imageDocs);

          console.log(
            `✅ Stored ${imageDocs.length} images for ${pdfDoc.answerPdfName}`,
          );
        } catch (err) {
          console.error(
            `❌ Background extraction failed for ${pdfDoc.answerPdfName}`,
            err,
          );
        }
      }

      console.log("🎉 Background extraction completed.");
    });
  } catch (error) {
    console.error("❌ Error in assignBookletWiseTask:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create booklet-wise task",
      error: error.message,
    });
  }
};

const getBookletTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Task ID" });
    }

    /* ---------------------------------------------------- */
    /* 1️⃣ FETCH TASK                                       */
    /* ---------------------------------------------------- */

    const task = await BookletTask.findById(id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    /* ---------------------------------------------------- */
    /* 2️⃣ HANDLE TIMER LOGIC                               */
    /* ---------------------------------------------------- */

    let remainingSeconds = 0;

    if (!task.startTime) {
      task.startTime = new Date();
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    }

    if (task.remainingTimeInSec != null) {
      const elapsed = Math.floor((new Date() - task.lastResumedAt) / 1000);
      remainingSeconds = Math.max(task.remainingTimeInSec - elapsed, 0);
    } else {
      // Get schema maxTime
      const subject = await Subject.findOne({ code: task.subjectCode });
      const schemaRelation = await SubjectSchemaRelation.findOne({
        subjectId: subject._id,
      });

      const schemaDetails = await Schema.findById(schemaRelation.schemaId);

      remainingSeconds = schemaDetails.maxTime * 60;

      // Save initial remaining time
      task.remainingTimeInSec = remainingSeconds;
      await task.save();
    }

    /* ---------------------------------------------------- */
    /* 3️⃣ GET CURRENT PDF                                  */
    /* ---------------------------------------------------- */

    const assignedPdfs = await BookletAnswerPdf.find({
      bookletTaskId: task._id,
    }).sort({ assignedDate: 1 });

    if (!assignedPdfs.length) {
      return res.status(404).json({
        message: "No PDFs assigned to this task",
      });
    }

    const currentPdf = assignedPdfs[task.currentFileIndex - 1];

    if (!currentPdf) {
      return res.status(404).json({
        message: "No PDF found at current index",
      });
    }

    /* ---------------------------------------------------- */
    /* 4️⃣ GET SCHEMA DETAILS                               */
    /* ---------------------------------------------------- */

    const subject = await Subject.findOne({
      code: task.subjectCode,
    });

    const schemaRelation = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    });

    const schemaDetails = await Schema.findById(schemaRelation.schemaId);

    /* ---------------------------------------------------- */
    /* 5️⃣ EXTRACTED PATH                                   */
    /* ---------------------------------------------------- */

    const bookletName = currentPdf.answerPdfName.replace(".pdf", "");

    const extractedBookletPath = `processedFolder/${task.subjectCode}/bookletWiseExtracted/${bookletName}`;
    const questionImagesFolderUrl = `processedFolder/${task.subjectCode}/bookletWiseExtracted/${bookletName}`;

    /* ---------------------------------------------------- */
    /* 6️⃣ FETCH IMAGES                                     */
    /* ---------------------------------------------------- */

    const answerPdfImages = await BookletAnswerPdfImage.find({
      bookletAnswerPdfId: currentPdf._id,
    }).sort({ page: 1 });

    /* ---------------------------------------------------- */
    /* 7️⃣ UPDATE STATUS TO PROGRESS                        */
    /* ---------------------------------------------------- */

    if (currentPdf.status === "false") {
      currentPdf.status = "progress";
      await currentPdf.save();
    }

    /* ---------------------------------------------------- */
    /* ✅ FINAL RESPONSE                                     */
    /* ---------------------------------------------------- */

    return res.status(200).json({
      task,
      remainingSeconds,
      answerPdfDetails: currentPdf,
      schemaDetails,
      extractedBookletPath,
      questionImagesFolderUrl,
      answerPdfImages,
    });
  } catch (error) {
    console.error("❌ Error in getBookletTaskById:", error);
    return res.status(500).json({
      message: "Failed to fetch booklet task",
      error: error.message,
    });
  }
};

const getBookletTasksByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const tasks = await BookletTask.find({
      userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!tasks.length) {
      return res.status(200).json([]);
    }

    // Optional: add completed & pending counts
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        const completed = await BookletAnswerPdf.countDocuments({
          bookletTaskId: task._id,
          status: "true",
        });

        const pending = await BookletAnswerPdf.countDocuments({
          bookletTaskId: task._id,
          status: { $in: ["false", "progress"] },
        });

        return {
          ...task,
          taskType: "booklet",
          completedBooklets: completed,
          pendingBooklets: pending,
        };
      }),
    );

    return res.status(200).json(enrichedTasks);
  } catch (error) {
    console.error("Error fetching booklet tasks:", error);
    return res.status(500).json({
      message: "Failed to fetch booklet tasks",
      error: error.message,
    });
  }
};

const startBookletTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ message: "taskId is required" });
    }

    const task = await BookletTask.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.status === "success") {
      return res.status(400).json({
        message: "Task already completed",
      });
    }

    // If first time start
    if (!task.startTime) {
      task.startTime = new Date();
    }

    task.status = "active";
    task.lastResumedAt = new Date();

    await task.save();

    return res.status(200).json({
      message: "Task started successfully",
      taskId: task._id,
      status: task.status,
    });
  } catch (error) {
    console.error("Error starting booklet task:", error);
    return res.status(500).json({
      message: "Failed to start booklet task",
      error: error.message,
    });
  }
};

const completeBookletWise = async (req, res) => {
  try {
    const { answerPdfId, userId } = req.params;
    const { submitted } = req.body;

    if (!isValidObjectId(answerPdfId)) {
      return res.status(400).json({ message: "Invalid answerPdfId" });
    }

    /* ===================================================== */
    /* 1️⃣ FETCH BOOKLET PDF + TASK                         */
    /* ===================================================== */

    const pdf = await BookletAnswerPdf.findById(answerPdfId);
    if (!pdf) {
      return res.status(404).json({ message: "PDF not found" });
    }

    const task = await BookletTask.findById(pdf.bookletTaskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const subjectCode = task.subjectCode;

    /* ===================================================== */
    /* 2️⃣ SCHEMA + EFFICIENCY CALCULATION                  */
    /* ===================================================== */

    const subject = await Subject.findOne({ code: subjectCode });
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const schemaRelation = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    });
    if (!schemaRelation) {
      return res.status(404).json({ message: "Schema relation not found" });
    }

    const schemaDoc = await Schema.findById(schemaRelation.schemaId);

    const minTime = Number(schemaDoc?.minTime);
    const maxTime = Number(schemaDoc?.maxTime);
    const submittedTime = Number(submitted);

    if (
      !Number.isFinite(minTime) ||
      !Number.isFinite(maxTime) ||
      !Number.isFinite(submittedTime)
    ) {
      return res.status(400).json({ message: "Invalid timing values" });
    }

    if (maxTime <= minTime) {
      return res.status(400).json({
        message: "Schema config error: maxTime must be greater than minTime",
      });
    }

    const effectiveTime = Math.max(minTime, submittedTime);

    const efficiency = Math.round(
      ((maxTime - effectiveTime) / (maxTime - minTime)) * 100,
    );

    if (Number.isFinite(efficiency)) {
      await User.updateOne({ _id: userId }, { $push: { efficiency } });
    }

    /* ===================================================== */
    /* 3️⃣ SYNC BOOKLET ANNOTATIONS + MARKS                 */
    /* ===================================================== */

    const folderPath = path.join(
      "BookletAnnotations",
      String(userId),
      String(answerPdfId),
    );

    if (!fs.existsSync(folderPath)) {
      return res.status(400).json({
        message: "Annotations folder not found",
      });
    }

    /* ---------------- ICONS SYNC ---------------- */

    const pageFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.startsWith("page_") && file.endsWith(".json"));

    let iconBulkOps = [];

    for (const file of pageFiles) {
      const pageNumber = Number(file.replace("page_", "").replace(".json", ""));

      const filePath = path.join(folderPath, file);

      let jsonData;
      try {
        jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        continue;
      }

      const annotations = jsonData.annotations || [];

      for (const a of annotations) {
        if (!a.id) continue;

        iconBulkOps.push({
          updateOne: {
            filter: { annotationId: a.id },
            update: {
              $set: {
                annotationId: a.id,
                bookletAnswerPdfImageId: a.bookletAnswerPdfImageId,
                iconUrl: a.iconUrl,
                question: a.question,
                timeStamps: a.timeStamps,
                x: String(a.x),
                y: String(a.y),
                width: String(a.width),
                height: String(a.height),
                mark: String(a.mark),
                comment: a.comment ?? "",
                bookletAnswerPdfId: answerPdfId,
                page: pageNumber,
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (iconBulkOps.length > 0) {
      await BookletIcon.bulkWrite(iconBulkOps);
    }

    /* ---------------- MARKS SYNC ---------------- */

    const marksFile = path.join(folderPath, "marks.json");

    if (fs.existsSync(marksFile)) {
      let marksJSON;
      try {
        marksJSON = JSON.parse(fs.readFileSync(marksFile, "utf8"));
      } catch {
        marksJSON = null;
      }

      if (marksJSON) {
        const marksArray = marksJSON.marks || [];
        let marksBulkOps = [];

        for (const m of marksArray) {
          if (!m.question || m.allottedMarks === undefined) continue;

          marksBulkOps.push({
            updateOne: {
              filter: {
                bookletAnswerPdfId: answerPdfId,
                questionLabel: m.question,
              },
              update: {
                $set: {
                  bookletAnswerPdfId: answerPdfId,
                  questionLabel: m.question,
                  allottedMarks: Number(m.allottedMarks),
                  timerStamps: m.timeStamps ?? "",
                  isMarked: Boolean(m.synced ?? false),
                  evaluatedBy: userId,
                },
              },
              upsert: true,
            },
          });
        }

        if (marksBulkOps.length > 0) {
          await BookletMarks.bulkWrite(marksBulkOps);
        }
      }
    }

    /* ===================================================== */
    /* 4️⃣ UPDATE PDF STATUS                                */
    /* ===================================================== */

    pdf.status = "true";
    pdf.evaluatedAt = new Date();
    await pdf.save();

    /* ===================================================== */
    /* 5️⃣ UPDATE SUBJECT FOLDER COUNTS                     */
    /* ===================================================== */

    await SubjectFolderModel.updateOne(
      { folderName: subjectCode },
      {
        $inc: {
          evaluated: 1,
          evaluation_pending: -1,
          allocated: -1,
        },
      },
    );

    /* ===================================================== */
    /* 6️⃣ TASK PROGRESSION                                 */
    /* ===================================================== */

    const pending = await BookletAnswerPdf.countDocuments({
      bookletTaskId: task._id,
      status: { $ne: "true" },
    });

    if (pending === 0) {
      task.status = "success";
    } else {
      task.currentFileIndex += 1;
      task.status = "active";
    }

    await task.save();

    return res.status(200).json({
      success: true,
      message:
        pending === 0
          ? "All booklets completed. Task finished."
          : "Booklet submitted. Moving to next booklet.",
      taskCompleted: pending === 0,
      nextFileIndex: task.currentFileIndex,
    });
  } catch (error) {
    console.error("❌ Error in completeBookletWise:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const rejectBookletWise = async (req, res) => {
  const { answerPdfId } = req.params;
  const { reason } = req.body;

  await BookletAnswerPdf.findByIdAndUpdate(answerPdfId, {
    status: "reject",
    rejectionReason: reason,
    rejectedAt: new Date(),
  });

  return res.status(200).json({
    message: "Booklet rejected",
  });
};

// const reassignPendingBooklets = async (req, res) => {
//   const { fromTaskId, toUserId, transferCount, reassignedBy } = req.body;

//   console.log("Reassignment request:", req.body);

//   const session = await mongoose.startSession();

//   try {
//     session.startTransaction();

//     if (!fromTaskId || !toUserId || !transferCount || transferCount <= 0) {
//       return res.status(400).json({ message: "Invalid payload" });
//     }

//     // 🔹 SOURCE TASK
//     const fromTask = await Task.findById(fromTaskId).session(session);

//     if (!fromTask) {
//       return res.status(404).json({ message: "Source task not found" });
//     }

//     // 🔒 RULE 1: Task must be inactive or active
//     if (!["inactive", "active"].includes(fromTask.status)) {
//       return res.status(400).json({
//         message: "Completed task booklets cannot be reassigned",
//       });
//     }
//     console.log("questiondefid:", fromTask.questiondefinitionId);

//     // 🔹 TARGET TASK (same subjectCode)
//     let toTask = await Task.findOne({
//       userId: toUserId,
//       subjectCode: fromTask.subjectCode,
//       questiondefinitionId: fromTask.questiondefinitionId,
//       status: { $ne: "success" },
//     }).session(session);

//     if (!toTask) {
//       toTask = new Task({
//         subjectCode: fromTask.subjectCode,
//         questiondefinitionId: fromTask.questiondefinitionId,
//         userId: toUserId,
//         totalBooklets: 0,
//         status: "inactive",
//         currentFileIndex: 1,
//       });
//       await toTask.save({ session });
//     }

//     if (toUserId.role === "reviewer") {
//       // ← here toUserId is the populated user

//       // extract the real ID

//       let toTask = await Task.findOne({
//         userId: toUserId,
//         subjectCode: fromTask.subjectCode,
//         questiondefinitionId: fromTask.questiondefinitionId,
//       }).session(session);

//       if (!toTask) {
//         toTask = new Task({
//           subjectCode: fromTask.subjectCode,
//           userId: reviewerId,
//           questiondefinitionId: fromTask.questiondefinitionId, // critical
//           totalBooklets: 0,
//           status: "inactive",
//           currentFileIndex: 1,
//         });

//         await toTask.save({ session });
//       }
//     }

//     // 🔹 FETCH ONLY PENDING (status:false) PDFs
//     const pendingPdfs = await AnswerPdf.find({
//       taskId: fromTask._id,
//       status: { $in: ["false", "progress"] },
//     })
//       .limit(Number(transferCount))
//       .session(session);

//     console.log("pending pdfs", pendingPdfs.length);

//     if (pendingPdfs.length < transferCount) {
//       return res.status(400).json({
//         message: "Not enough pending booklets to reassign",
//       });
//     }

//     const transferredPdfNames = [];

//     // 🔁 MOVE BOOKLETS
//     for (const pdf of pendingPdfs) {
//       pdf.taskId = toTask._id;
//       pdf.assignedDate = new Date();
//       await pdf.save({ session });

//       transferredPdfNames.push(pdf.answerPdfName);
//     }

//     // 🔢 UPDATE COUNTS
//     fromTask.totalBooklets -= pendingPdfs.length;
//     toTask.totalBooklets += pendingPdfs.length;

//     await fromTask.save({ session });
//     await toTask.save({ session });

//     // 🧾 LOG HISTORY
//     await BookletReassignment.create(
//       [
//         {
//           subjectCode: fromTask.subjectCode,
//           fromUserId: fromTask.userId,
//           toUserId,
//           fromTaskId: fromTask._id,
//           toTaskId: toTask._id,
//           transferredCount: pendingPdfs.length,
//           transferredPdfNames,
//           reassignedBy,
//         },
//       ],
//       { session },
//     );

//     await session.commitTransaction();
//     session.endSession();

//     return res.status(200).json({
//       success: true,
//       message: `${pendingPdfs.length} pending booklets reassigned successfully`,
//       transferredPdfNames,
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();

//     console.error("Reassignment failed:", error);
//     return res.status(500).json({
//       message: "Failed to reassign booklets",
//     });
//   }
// };

const reassignPendingBooklets = async (req, res) => {

  const {
    fromTaskId,
    toUserId,
    transferCount,
    reassignedBy,
    taskType = "question"
  } = req.body;

  if (!fromTaskId || !toUserId || !transferCount || Number(transferCount) <= 0) {
    return res.status(400).json({
      message:
        "Invalid payload: fromTaskId, toUserId, transferCount required",
    });
  }

  const session = await mongoose.startSession();

  try {

    await session.startTransaction();

    const isBooklet = taskType === "booklet";

    /* --------------------------------------------------- */
    /* 🔹 LOAD SOURCE TASK                                 */
    /* --------------------------------------------------- */

    const TaskModel = isBooklet ? BookletTask : Task;
    const PdfModel = isBooklet ? BookletAnswerPdf : AnswerPdf;

    const fromTask = await TaskModel.findById(fromTaskId).session(session);

    if (!fromTask) {
      throw new Error("Source task not found");
    }

    /* --------------------------------------------------- */
    /* 🔹 LOAD TARGET USER                                 */
    /* --------------------------------------------------- */

    const toUser = await User.findById(toUserId).session(session);

    if (!toUser) {
      throw new Error("Target user not found");
    }

    const isEvaluator = toUser.role === "evaluator";
    const isReviewer = toUser.role === "reviewer";

    if (!isEvaluator && !isReviewer) {
      throw new Error("Target user must be evaluator or reviewer");
    }

    /* --------------------------------------------------- */
    /* 🔹 TASK STATUS VALIDATION                           */
    /* --------------------------------------------------- */

    if (isEvaluator) {
      if (!["inactive", "active"].includes(fromTask.status)) {
        throw new Error(
          "Evaluators can only receive from active or inactive tasks"
        );
      }
    }

    if (isReviewer) {
      if (fromTask.status !== "success") {
        throw new Error(
          "Reviewers can only receive from completed tasks"
        );
      }
    }

    /* --------------------------------------------------- */
    /* 🔹 FIND / CREATE TARGET TASK                        */
    /* --------------------------------------------------- */

    let toTask;

    if (isBooklet) {

      toTask = await BookletTask.findOne({
        userId: toUser._id,
        subjectCode: fromTask.subjectCode,
      }).session(session);

      if (!toTask) {
        toTask = new BookletTask({
          subjectCode: fromTask.subjectCode,
          userId: toUser._id,
          totalBooklets: 0,
          status: "inactive",
          currentFileIndex: 1,
        });

        await toTask.save({ session });
      }

    } else {

      toTask = await Task.findOne({
        userId: toUser._id,
        subjectCode: fromTask.subjectCode,
        questiondefinitionId: fromTask.questiondefinitionId,
      }).session(session);

      if (!toTask) {

        toTask = new Task({
          subjectCode: fromTask.subjectCode,
          userId: toUser._id,
          questiondefinitionId: fromTask.questiondefinitionId,
          totalBooklets: 0,
          status: "inactive",
          currentFileIndex: 1,
        });

        await toTask.save({ session });
      }
    }

    /* --------------------------------------------------- */
    /* 🔹 STATUS FILTER                                    */
    /* --------------------------------------------------- */

    const statusFilter = isReviewer
      ? ["true"]
      : ["false", "progress"];

    const query = isBooklet
      ? {
          bookletTaskId: fromTask._id,
          status: { $in: statusFilter },
        }
      : {
          taskId: fromTask._id,
          questiondefinitionId: fromTask.questiondefinitionId,
          status: { $in: statusFilter },
        };

    const pdfsToTransfer = await PdfModel.find(query)
      .limit(Number(transferCount))
      .session(session);

    if (pdfsToTransfer.length < transferCount) {
      throw new Error(
        `Not enough booklets available. Found: ${pdfsToTransfer.length}`
      );
    }

    /* --------------------------------------------------- */
    /* 🔹 TRANSFER PDFs                                    */
    /* --------------------------------------------------- */

    const transferredPdfNames = [];

    for (const pdf of pdfsToTransfer) {

      const oldStatus = pdf.status;

      if (isReviewer) {
        pdf.status = "progress";
      }

      if (isBooklet) {
        pdf.bookletTaskId = toTask._id;
      } else {
        pdf.taskId = toTask._id;
      }

      pdf.assignedDate = new Date();

      await pdf.save({ session });

      transferredPdfNames.push({
        name: pdf.answerPdfName,
        previousStatus: oldStatus,
        newStatus: pdf.status,
      });

    }

    /* --------------------------------------------------- */
    /* 🔹 UPDATE TASK COUNTS                               */
    /* --------------------------------------------------- */

    fromTask.totalBooklets = Math.max(
      0,
      fromTask.totalBooklets - pdfsToTransfer.length
    );

    toTask.totalBooklets += pdfsToTransfer.length;

    await fromTask.save({ session });
    await toTask.save({ session });

    /* --------------------------------------------------- */
    /* 🔹 LOG                                              */
    /* --------------------------------------------------- */

    await BookletReassignment.create(
      [
        {
          subjectCode: fromTask.subjectCode,
          fromUserId: fromTask.userId,
          toUserId: toUser._id,
          fromTaskId: fromTask._id,
          toTaskId: toTask._id,
          transferredCount: pdfsToTransfer.length,
          transferredPdfNames: pdfsToTransfer.map((p) => p.answerPdfName),
          reassignedBy: reassignedBy || null,
          reassignedAt: new Date(),
          transferType: isReviewer
            ? "completed-to-review"
            : "pending-to-evaluate",
          taskType
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: `${pdfsToTransfer.length} booklets reassigned successfully`,
      taskType,
      transferredCount: pdfsToTransfer.length,
      transferredItems: transferredPdfNames,
      fromTaskId: fromTask._id.toString(),
      toTaskId: toTask._id.toString(),
    });

  } catch (error) {

    await session.abortTransaction();

    console.error("Reassignment error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Reassignment failed",
    });

  } finally {

    session.endSession();

  }
};
const reassignBooklets = async (req, res) => {
  const { fromUserId, toUserId, subjectCode, transferCount, reassignedBy } =
    req.body;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    if (
      !fromUserId ||
      !toUserId ||
      !subjectCode ||
      !transferCount ||
      transferCount <= 0
    ) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    // 🔹 Find source task
    const fromTask = await Task.findOne({
      userId: fromUserId,
      subjectCode,
      status: { $ne: "success" },
    }).session(session);

    if (!fromTask) {
      return res.status(404).json({
        message: "Source task not found",
      });
    }

    // 🔹 Get uncompleted PDFs from source user
    const sourcePdfs = await AnswerPdf.find({
      taskId: fromTask._id,
      status: "false",
    })
      .limit(Number(transferCount))
      .session(session);

    if (sourcePdfs.length < transferCount) {
      return res.status(400).json({
        message: "Not enough pending booklets to transfer",
      });
    }

    // 🔹 Find / create target task
    let toTask = await Task.findOne({
      userId: toUserId,
      subjectCode,
    }).session(session);

    if (!toTask) {
      toTask = new Task({
        subjectCode,
        userId: toUserId,
        totalBooklets: 0,
        status: "inactive",
        currentFileIndex: 1,
      });
      await toTask.save({ session });
    }

    const transferredPdfNames = [];

    // 🔹 Move PDFs
    for (const pdf of sourcePdfs) {
      pdf.taskId = toTask._id;
      pdf.assignedDate = new Date();
      await pdf.save({ session });

      transferredPdfNames.push(pdf.answerPdfName);
    }

    // 🔹 Update booklet counts
    fromTask.totalBooklets -= sourcePdfs.length;
    toTask.totalBooklets += sourcePdfs.length;

    await fromTask.save({ session });
    await toTask.save({ session });

    // 🔹 Insert reassignment log
    await BookletReassignment.create(
      [
        {
          subjectCode,
          fromUserId,
          toUserId,
          fromTaskId: fromTask._id,
          toTaskId: toTask._id,
          transferredCount: sourcePdfs.length,
          transferredPdfNames,
          reassignedBy,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: `${sourcePdfs.length} booklets reassigned successfully`,
      transferredPdfNames,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Reassignment error:", error);
    return res.status(500).json({
      message: "Failed to reassign booklets",
    });
  }
};

const editTaskHandler = async (req, res) => {
  const { taskId } = req.params;

  if (!isValidObjectId(taskId)) {
    return res.status(400).json({ message: "Invalid taskId" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1️⃣ Fetch task
    const task = await Task.findById(taskId).session(session);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // 2️⃣ Frontend sends FULL task payload → derive intent
    const newTotal = Number(req.body.totalBooklets);
    const oldTotal = task.totalBooklets;

    if (!newTotal || newTotal <= 0) {
      return res.status(400).json({
        message: "totalBooklets must be greater than 0",
      });
    }

    const diff = newTotal - oldTotal;
    let allocate = 0;
    let unallocate = 0;

    if (diff > 0) allocate = diff;
    if (diff < 0) unallocate = Math.abs(diff);

    /* =====================================================
       🔻 UN-ALLOCATE BOOKLETS
    ===================================================== */
    if (unallocate > 0) {
      // Only pending / progress booklets can be removed
      const removable = await AnswerPdf.find({
        taskId,
        status: { $in: ["false", "progress"] },
      })
        .limit(unallocate)
        .session(session);

      if (removable.length < unallocate) {
        return res.status(400).json({
          message: "Not enough pending/progress booklets to unallocate",
        });
      }

      const removeIds = removable.map((b) => b._id);

      // Delete AnswerPdf entries
      await AnswerPdf.deleteMany({ _id: { $in: removeIds } }, { session });

      // Update task count
      task.totalBooklets -= removeIds.length;

      // 🔁 Update SubjectFolderModel counts
      await SubjectFolderModel.updateOne(
        { folderName: task.subjectCode },
        {
          $inc: {
            allocated: -removeIds.length,
            unAllocated: removeIds.length,
          },
          $set: { updatedAt: new Date() },
        },
        { session },
      );
    }

    /* =====================================================
       🔺 ALLOCATE BOOKLETS
    ===================================================== */
    if (allocate > 0) {
      const subjectFolderPath = path.join(
        __dirname,
        "processedFolder",
        task.subjectCode,
      );

      if (!fs.existsSync(subjectFolderPath)) {
        return res.status(404).json({
          message: "Processed folder not found for subject",
        });
      }

      const allPdfs = fs
        .readdirSync(subjectFolderPath)
        .filter((f) => f.endsWith(".pdf"));

      // PDFs already assigned to THIS task
      const alreadyAssigned = await AnswerPdf.find({
        taskId,
      }).distinct("answerPdfName");

      const available = allPdfs.filter((pdf) => !alreadyAssigned.includes(pdf));

      if (available.length < allocate) {
        return res.status(400).json({
          message: "Not enough unassigned PDFs available",
        });
      }

      const newAssignments = available.slice(0, allocate).map((pdf) => ({
        taskId,
        answerPdfName: pdf,
        status: "false",
        assignedDate: new Date(),
      }));

      await AnswerPdf.insertMany(newAssignments, { session });

      // Update task count
      task.totalBooklets += newAssignments.length;

      // 🔁 Update SubjectFolderModel counts
      await SubjectFolderModel.updateOne(
        { folderName: task.subjectCode },
        {
          $inc: {
            allocated: newAssignments.length,
            unAllocated: -newAssignments.length,
          },
          $set: { updatedAt: new Date() },
        },
        { session },
      );
    }

    // 3️⃣ Save task
    await task.save({ session });

    // 4️⃣ Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("❌ Edit task error:", error);
    return res.status(500).json({
      message: "Failed to edit task",
    });
  }
};

const createScannerTask = async (req, res) => {
  try {
    const { userId, subjectCode, folderName } = req.body;

    // Prevent duplicate scanner task
    const existingTask = await ScannerTask.findOne({
      userId,
      subjectCode,
      folderName,
    });

    if (existingTask) {
      return res.status(409).json({
        message: "Scanner task already exists for this folder",
      });
    }
    const subject = await Subject.findOne({ code: subjectCode });

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const schemaRelation = await CourseSchemaRelation.findOne({
      subjectId: subject._id,
    });

    if (!schemaRelation) {
      return res.status(404).json({ message: "Schema relation not found" });
    }

    const schema = await Schema.findById(schemaRelation.schemaId);

    if (!schema) {
      return res.status(404).json({ message: "Schema not found" });
    }

    const templateId = schema.templateId;

    // ✅ IMPORTANT: different variable name
    const newScannerTask = new ScannerTask({
      subjectCode,
      userId,
      folderName,
      templateId,
      status: "inactive",
    });

    await newScannerTask.save();
    console.log("scannertask", newScannerTask);

    return res.status(201).json({
      message: "Scanner task created successfully",
      data: newScannerTask,
    });
  } catch (error) {
    console.error("Error creating scanner task:", error);
    return res.status(500).json({
      message: "Failed to create scanner task",
      error: error.message,
    });
  }
};

const getUserCurrentTaskStatus = async (req, res) => {
  const { userId } = req.params;

  try {
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    /* --------------------------------------------------- */
    /* 🔹 USER                                             */
    /* --------------------------------------------------- */

    const user = await User.findById(userId).select("name email maxBooklets");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const responseTasks = [];

    /* --------------------------------------------------- */
    /* 🔹 QUESTION TASKS                                   */
    /* --------------------------------------------------- */

    const questionTasks = await Task.find({ userId });

    for (const task of questionTasks) {

      const subject = await Subject.findOne({ code: task.subjectCode });

      const schemaRelation = subject
        ? await SubjectSchemaRelation.findOne({
            subjectId: subject._id,
          })
        : null;

      const totalBooklets = task.totalBooklets;

      const completedBooklets = await AnswerPdf.countDocuments({
        taskId: task._id,
        questiondefinitionId: task.questiondefinitionId,
        status: "true",
      });

      const pendingBooklets = await AnswerPdf.countDocuments({
        taskId: task._id,
        questiondefinitionId: task.questiondefinitionId,
        $or: [{ status: "false" }, { status: "progress" }],
      });

      const latestAssignment = await AnswerPdf.findOne({
        taskId: task._id,
      })
        .sort({ assignedDate: -1 })
        .select("assignedDate");

      responseTasks.push({
        taskId: task._id,
        taskType: "question",

        subjectCode: task.subjectCode,
        subjectName: subject?.name || null,

        taskStatus: task.status,
        currentFileIndex: task.currentFileIndex,

        statusBreakdown: {
          completed: completedBooklets,
          progress: 0,
          pending: pendingBooklets,
        },

        schema: schemaRelation
          ? {
              schemaId: schemaRelation.schemaId,
              questionPdfPath: schemaRelation.questionPdfPath,
              answerPdfPath: schemaRelation.answerPdfPath,
              countOfQuestionImages: schemaRelation.countOfQuestionImages,
              countOfAnswerImages: schemaRelation.countOfAnswerImages,
            }
          : null,

        booklets: {
          total: totalBooklets,
          completed: completedBooklets,
          pending: pendingBooklets,
        },

        lastAssignedAt: latestAssignment?.assignedDate || null,
      });
    }

    /* --------------------------------------------------- */
    /* 🔹 BOOKLET TASKS                                    */
    /* --------------------------------------------------- */

    const bookletTasks = await BookletTask.find({ userId });

    for (const task of bookletTasks) {

      const subject = await Subject.findOne({ code: task.subjectCode });

      const schemaRelation = subject
        ? await SubjectSchemaRelation.findOne({
            subjectId: subject._id,
          })
        : null;

      const totalBooklets = task.totalBooklets;

      const completedBooklets = await BookletAnswerPdf.countDocuments({
        bookletTaskId: task._id,
        status: "true",
      });

      const pendingBooklets = await BookletAnswerPdf.countDocuments({
        bookletTaskId: task._id,
        $or: [{ status: "false" }, { status: "progress" }],
      });

      const latestAssignment = await BookletAnswerPdf.findOne({
        bookletTaskId: task._id,
      })
        .sort({ assignedDate: -1 })
        .select("assignedDate");

      responseTasks.push({
        taskId: task._id,
        taskType: "booklet",

        subjectCode: task.subjectCode,
        subjectName: subject?.name || null,

        taskStatus: task.status,
        currentFileIndex: task.currentFileIndex,

        statusBreakdown: {
          completed: completedBooklets,
          progress: 0,
          pending: pendingBooklets,
        },

        schema: schemaRelation
          ? {
              schemaId: schemaRelation.schemaId,
              questionPdfPath: schemaRelation.questionPdfPath,
              answerPdfPath: schemaRelation.answerPdfPath,
              countOfQuestionImages: schemaRelation.countOfQuestionImages,
              countOfAnswerImages: schemaRelation.countOfAnswerImages,
            }
          : null,

        booklets: {
          total: totalBooklets,
          completed: completedBooklets,
          pending: pendingBooklets,
        },

        lastAssignedAt: latestAssignment?.assignedDate || null,
      });
    }

    /* --------------------------------------------------- */
    /* ✅ FINAL RESPONSE                                   */
    /* --------------------------------------------------- */

    return res.status(200).json({
      user,
      tasks: responseTasks,
    });

  } catch (error) {

    console.error("Error fetching user task status:", error);

    return res.status(500).json({
      message: "Failed to fetch user task status",
    });
  }
};

const autoAssigning = async (req, res) => {
  const { subjectCode } = req.body;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const subject = await Subject.findOne({ code: subjectCode });

    if (!subject) {
      console.error(`Subject ${subjectCode} not found.`);
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: `Subject ${subjectCode} not found.`,
      });
    }

    const users = await User.find({ subjectCode: subject._id });

    if (users.length === 0) {
      console.warn(`No users found for subject ${subjectCode}.`);
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `No users available for subject ${subjectCode}.`,
      });
    }

    const processedFolderPath = path.join(
      __dirname,
      "processedFolder",
      subjectCode,
    );

    if (!fs.existsSync(processedFolderPath)) {
      console.error(`Folder for subject ${subjectCode} not found.`);
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: `Processed folder not found for subject ${subjectCode}.`,
      });
    }

    // ALL PDFs in subject folder
    const allPdfs = fs
      .readdirSync(processedFolderPath)
      .filter((file) => file.endsWith(".pdf"));

    if (allPdfs.length === 0) {
      console.log(`No PDFs found for subject ${subjectCode}.`);
      await session.abortTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: `No PDFs available for auto assignment.`,
        assigned: 0,
      });
    }

    let unallocatedPdfs = (
      await SubjectFolderModel.findOne(
        { folderName: subjectCode },
        { unAllocated: 1, _id: 0 },
      ).lean()
    )?.unAllocated;

    console.log("unallocated-pdfs", unallocatedPdfs);

    // 2. FIRST TIME running → treat all PDFs as unallocated
    if (unallocatedPdfs === undefined) {
      unallocatedPdfs = allPdfs.length;
    }

    console.log("previousUnallocated →", unallocatedPdfs);

    // 3. Extract only remaining unallocated PDFs
    let newPdfs;

    if (unallocatedPdfs > 0) {
      // only take remaining PDFs
      newPdfs = allPdfs.slice(-unallocatedPdfs);
    } else {
      // unallocatedPdfs === 0
      newPdfs = [];
    }

    console.log("PDFs to be assigned now:", newPdfs);

    const numUsers = users.length;
    let assignmentIndex = 0;
    let totalAssigned = 0;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    console.log("new-pdf", newPdfs.length);

    console.log("all-pdfs", allPdfs.length);

    // ⭐ MAIN ASSIGNMENT LOOP ⭐
    for (const pdfFile of newPdfs) {
      let assigned = false;

      // Try to assign this PDF to someone
      for (let u = 0; u < numUsers; u++) {
        const user = users[assignmentIndex % numUsers];

        // Count how many PDFs assigned to THIS user already
        // const userAssignedCount = await AnswerPdf.countDocuments({
        //   taskId: {
        //     $in: await Task.find({
        //       userId: user._id,
        //       subjectCode,
        //     }).distinct("_id"),
        //   },
        // }).session(session);

        const taskIds = await Task.find({
          userId: user._id,
        })
          .distinct("_id")
          .session(session);

        const todayPending = await AnswerPdf.countDocuments({
          taskId: { $in: taskIds },
          status: "false",
          assignedDate: { $gte: startOfDay, $lte: endOfDay },
        }).session(session);

        const dailyLimit = user.maxBooklets || 0;
        const availableToday = Math.max(0, dailyLimit - todayPending);

        // FETCH existing task for this user
        let task = await Task.findOne({
          userId: user._id,
          subjectCode,
        }).session(session);

        // If NO existing task → create one
        if (!task) {
          task = new Task({
            subjectCode,
            userId: user._id,
            totalBooklets: 0,
            status: "inactive",
            currentFileIndex: 1,
          });

          await task.save({ session });
        } else {
          // 🔁 Re-assignment case
          if (task.status === "success") {
            task.status = "inactive";
            await task.save({ session });
          }
        }

        if (availableToday <= 0) {
          assignmentIndex++;
          continue;
        }

        // SAVE this booklet under task
        await new AnswerPdf({
          taskId: task._id,
          answerPdfName: pdfFile,
          status: "false",
          assignedDate: new Date(),
        }).save({ session });

        // Increase task booklet count
        task.totalBooklets += 1;
        await task.save({ session });

        assignmentIndex++;
        totalAssigned++;
        assigned = true;
        break; // stop looping user list for this PDF
      }

      // If NOT assigned to anyone → stop entirely
      if (!assigned) {
        console.log("⚠ No user has remaining capacity.");
        break;
      }
    }

    // -------- SUBJECT FOLDER MODEL UPDATE --------
    const allTaskIds = await Task.find({ subjectCode })
      .distinct("_id")
      .session(session);

    const evaluationPending = await AnswerPdf.countDocuments({
      status: "false",
      taskId: { $in: allTaskIds },
    }).session(session);

    console.log("evaluationPending", evaluationPending);

    const evaluated = await AnswerPdf.countDocuments({
      status: "true",
      taskId: { $in: allTaskIds },
    }).session(session);

    console.log("evaluated", evaluated);

    // total PDFs in folder - total assigned = unallocated

    //this will check subjectFolderModel for currently unallocated count and allocated count and evaluation pending count and evaluated count
    const previousUnallocated =
      (
        await SubjectFolderModel.findOne(
          { folderName: subjectCode },
          { unAllocated: 1, _id: 0 },
        ).lean()
      )?.unAllocated ?? 0;
    console.log("previousUnallocated", previousUnallocated);

    let unAllocated = 0;

    if (previousUnallocated === 0) {
      unAllocated = newPdfs.length - totalAssigned;
    } else {
      unAllocated = previousUnallocated - totalAssigned;
    }

    const previouslyAllocated =
      (
        await SubjectFolderModel.findOne(
          { folderName: subjectCode },
          { allocated: 1, _id: 0 },
        ).lean()
      )?.allocated ?? 0;
    console.log("previouslyAllocated", previouslyAllocated);

    let allocated = 0;
    if (previouslyAllocated === 0) {
      allocated = totalAssigned;
    } else {
      allocated = previouslyAllocated + totalAssigned;
    }

    await SubjectFolderModel.findOneAndUpdate(
      { folderName: subjectCode },
      {
        $set: {
          allocated: allocated,
          evaluation_pending: evaluationPending,
          evaluated: evaluated,
          unAllocated: unAllocated,
        },
        updatedAt: new Date(),
      },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    console.log(
      `Auto-assigned ${totalAssigned} booklets for subject ${subjectCode}.`,
    );
    res.status(200).json({
      message: `Auto-assigned ${totalAssigned} booklets for subject ${subjectCode}.`,
    });
  } catch (error) {
    console.error("Error during auto-assignment:", error);
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ error: "An error occurred during auto-assignment." });
  }
};

//In taskControllers.js Add this Function

const getReviewerTask = async (req, res) => {
  const { id } = req.params;

  try {
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    /* -------------------------------------------------------------------------- */
    /*                         🔒 REVIEWER BLOCK CHECK                            */
    /* -------------------------------------------------------------------------- */
    const conflictingTask = await Task.findOne({
      _id: { $ne: task._id },
      subjectCode: task.subjectCode,
      questiondefinitionId: task.questiondefinitionId,
      status: { $ne: "success" },
    });

    if (conflictingTask) {
      return res.status(200).json({
        task,
        status: "active",
        blocked: true,
        message: "this booklet is not yet evaluated",
      });
    }

    /* -------------------------------------------------------------------------- */
    /*                            ⏱️ TASK TIMING LOGIC                             */
    /* -------------------------------------------------------------------------- */
    if (!task.startTime) {
      task.startTime = new Date();
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    }

    const subject = await Subject.findOne({ code: task.subjectCode });
    if (!subject) {
      return res
        .status(404)
        .json({ message: "Subject not found (create subject)." });
    }

    const courseSchemaRel = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    });
    if (!courseSchemaRel) {
      return res.status(404).json({
        message:
          "Schema not found for subject (upload master answer and master question).",
      });
    }

    const schemaDetails = await Schema.findById(courseSchemaRel.schemaId);
    if (!schemaDetails) {
      return res.status(404).json({ message: "Schema not found." });
    }

    const maxTime = schemaDetails.maxTime;

    let remainingSeconds = 0;
    if (task.status === "paused" && task.remainingTimeInSec != null) {
      remainingSeconds = task.remainingTimeInSec;
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    } else if (task.status === "active" && task.lastResumedAt) {
      const elapsedSeconds = Math.floor(
        (new Date() - task.lastResumedAt) / 1000,
      );
      remainingSeconds = Math.max(
        (task.remainingTimeInSec ?? maxTime * 60) - elapsedSeconds,
        0,
      );
    } else {
      remainingSeconds = maxTime * 60;
    }

    /* -------------------------------------------------------------------------- */
    /*                             📂 FOLDER SETUP                             */
    /* -------------------------------------------------------------------------- */
    const rootFolder = path.join(__dirname, "processedFolder");
    const subjectFolder = path.join(rootFolder, task.subjectCode);

    if (!fs.existsSync(subjectFolder)) {
      return res.status(404).json({ message: "Subject folder not found." });
    }

    const extractedBookletsFolder = path.join(
      subjectFolder,
      "extractedBooklets",
    );
    if (!fs.existsSync(extractedBookletsFolder)) {
      fs.mkdirSync(extractedBookletsFolder, { recursive: true });
    }

    /* -------------------------------------------------------------------------- */
    /*                             📄 ASSIGNED PDF LOGIC                            */
    /* -------------------------------------------------------------------------- */
    const assignedPdfs = await AnswerPdf.find({ taskId: task._id });

    await AnswerPdf.updateMany(
      { taskId: task._id, status: "false" },
      { $set: { status: "progress" } },
    );

    if (!assignedPdfs.length) {
      return res
        .status(404)
        .json({ message: "No PDFs assigned to this task." });
    }

    const currentPdf = assignedPdfs[task.currentFileIndex - 1];
    if (!currentPdf) {
      return res
        .status(404)
        .json({ message: "No PDF found for current index." });
    }

    const pdfPath = path.join(subjectFolder, currentPdf.answerPdfName);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        message: `PDF ${currentPdf.answerPdfName} not found.`,
      });
    }

    const bookletName = path.basename(currentPdf.answerPdfName, ".pdf");
    const currentPdfFolder = path.join(extractedBookletsFolder, bookletName);

    const extractedBookletPath = `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}`;

    const questionImagesFolderUrl = `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}/questionImages/${task.questiondefinitionId}`;

    /* -------------------------------------------------------------------------- */
    /*                         🖼️ IMAGE EXTRACTION LOGIC                         */
    /* -------------------------------------------------------------------------- */
    let extractedImages = await AnswerPdfImage.find({
      answerPdfId: currentPdf._id,
      questiondefinitionId: task.questiondefinitionId,
    }).sort({ page: 1 });

    const questionDef = await QuestionDefinition.findById(
      task.questiondefinitionId,
    );

    const questionPages = new Set(questionDef.page);

    if (extractedImages.length === 0) {
      if (!fs.existsSync(currentPdfFolder)) {
        fs.mkdirSync(currentPdfFolder, { recursive: true });
      }

      const imageFiles = await extractImagesFromPdf(pdfPath, currentPdfFolder);

      const imageDocs = imageFiles
        .map((img) => {
          const match = img.match(/image_(\d+)\.png$/);
          if (!match) return null;
          const page = parseInt(match[1], 10);
          if (!questionPages.has(page)) return null;

          return {
            answerPdfId: currentPdf._id,
            questiondefinitionId: task.questiondefinitionId,
            name: img,
            page,
            status: "notVisited",
          };
        })
        .filter(Boolean);

      extractedImages = await AnswerPdfImage.insertMany(imageDocs);
    }

    const questionImagesFolder = path.join(
      currentPdfFolder,
      "questionImages",
      String(task.questiondefinitionId),
    );

    const relevantImages = extractedImages.filter((img) =>
      questionPages.has(img.page),
    );

    const questionImages = await extractQuestionImages(
      questionDef.coordinates,
      relevantImages,
      currentPdfFolder,
      questionImagesFolder,
    );

    const questionImagesWithUrls = questionImages.map((img) => ({
      ...img,
      url: `${questionImagesFolderUrl}/${img.image}`,
    }));

    /* -------------------------------------------------------------------------- */
    /*                         🧮 REVIEWER EXTRA DATA                            */
    /* -------------------------------------------------------------------------- */
    const marksDoc = await Marks.findOne({
      answerPdfId: currentPdf._id,
      questionDefinitionId: task.questiondefinitionId,
    }).lean();

    const reviewerQuestion = {
      questionDefinitionId: task.questiondefinitionId,
      question: questionDef.question || questionDef.name || "",
      allottedMarks: marksDoc?.allottedMarks ?? 0,
      pages: questionImagesWithUrls.map((img) => ({
        page: img.page,
        image: img.image,
        url: img.url,
        type: img.type,
      })),
    };

    /* -------------------------------------------------------------------------- */
    /*                             ✅ FINAL RESPONSE                             */
    /* -------------------------------------------------------------------------- */
    return res.status(200).json({
      task,
      questionDef,
      remainingSeconds,
      answerPdfDetails: currentPdf,
      schemaDetails,
      extractedBookletPath,
      questionImagesPath: `${extractedBookletPath}/questionImages/${task.questiondefinitionId}`,
      questionImagesFolderUrl,
      questionImages: questionImagesWithUrls,

      // 🔥 REVIEWER ONLY
      reviewerQuestion,
    });
  } catch (error) {
    console.error("❌ Error fetching reviewer task:", error.message);
    console.error(error.stack);
    return res.status(500).json({
      message: "Failed to process reviewer task",
      error: error.message,
    });
  }
};

const getReviewerBookletTask = async (req, res) => {
  const { id } = req.params;
  console.log("Task Id for reviewer booklet task is this",id)

  try {
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    const task = await BookletTask.findById(id);
    if (!task) {
      return res.status(404).json({ message: "Booklet task not found." });
    }

    /* -------------------------------------------------------------------------- */
    /*                         🔒 REVIEWER BLOCK CHECK                            */
    /* -------------------------------------------------------------------------- */

    const conflictingTask = await BookletTask.findOne({
      _id: { $ne: task._id },
      subjectCode: task.subjectCode,
      status: { $ne: "success" },
    });

    if (conflictingTask) {
      return res.status(200).json({
        task,
        status: "active",
        blocked: true,
        message: "This booklet is not yet evaluated",
      });
    }

    /* -------------------------------------------------------------------------- */
    /*                            ⏱️ TASK TIMER LOGIC                             */
    /* -------------------------------------------------------------------------- */

    if (!task.startTime) {
      task.startTime = new Date();
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    }

    const subject = await Subject.findOne({ code: task.subjectCode });

    if (!subject) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    const courseSchemaRel = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    });

    if (!courseSchemaRel) {
      return res.status(404).json({
        message: "Schema relation not found",
      });
    }

    const schemaDetails = await Schema.findById(courseSchemaRel.schemaId);

    if (!schemaDetails) {
      return res.status(404).json({
        message: "Schema not found",
      });
    }

    const maxTime = schemaDetails.maxTime;

    let remainingSeconds = 0;

    if (task.status === "paused" && task.remainingTimeInSec != null) {
      remainingSeconds = task.remainingTimeInSec;
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    } else if (task.status === "active" && task.lastResumedAt) {
      const elapsedSeconds = Math.floor(
        (new Date() - task.lastResumedAt) / 1000,
      );

      remainingSeconds = Math.max(
        (task.remainingTimeInSec ?? maxTime * 60) - elapsedSeconds,
        0,
      );
    } else {
      remainingSeconds = maxTime * 60;
    }

    /* -------------------------------------------------------------------------- */
    /*                             📂 FOLDER SETUP                                */
    /* -------------------------------------------------------------------------- */

    const rootFolder = path.join(__dirname, "processedFolder");
    const subjectFolder = path.join(rootFolder, task.subjectCode);

    if (!fs.existsSync(subjectFolder)) {
      return res.status(404).json({
        message: "Subject folder not found",
      });
    }

    const extractedBookletsFolder = path.join(
      subjectFolder,
      "extractedBooklets",
    );

    if (!fs.existsSync(extractedBookletsFolder)) {
      fs.mkdirSync(extractedBookletsFolder, { recursive: true });
    }

    /* -------------------------------------------------------------------------- */
    /*                         📄 FETCH ASSIGNED BOOKLETS                         */
    /* -------------------------------------------------------------------------- */

    const assignedPdfs = await BookletAnswerPdf.find({
      bookletTaskId: task._id,
    });

    await BookletAnswerPdf.updateMany(
      {
        bookletTaskId: task._id,
        status: "false",
      },
      {
        $set: { status: "progress" },
      },
    );

    if (!assignedPdfs.length) {
      return res.status(404).json({
        message: "No booklets assigned to this task.",
      });
    }

    const currentPdf = assignedPdfs[task.currentFileIndex - 1];
    console.log("Current pdf for the reviewer booklet is this", currentPdf)

    if (!currentPdf) {
      return res.status(404).json({
        message: "No booklet found for current index",
      });
    }

    const pdfPath = path.join(subjectFolder, currentPdf.answerPdfName);

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        message: `PDF ${currentPdf.answerPdfName} not found`,
      });
    }

    const bookletName = path.basename(currentPdf.answerPdfName, ".pdf");

    const currentPdfFolder = path.join(
      extractedBookletsFolder,
      bookletName,
    );

    const extractedBookletPath =
      `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}`;

    const questionImagesFolderUrl =
    `processedFolder/${task.subjectCode}/bookletWiseExtracted/${bookletName}`;

    /* -------------------------------------------------------------------------- */
    /*                         🖼️ FETCH BOOKLET IMAGES                            */
    /* -------------------------------------------------------------------------- */

    let extractedImages = await BookletAnswerPdfImage.find({
      bookletAnswerPdfId: currentPdf._id,
    }).sort({ page: 1 });

    if (extractedImages.length === 0) {

      if (!fs.existsSync(currentPdfFolder)) {
        fs.mkdirSync(currentPdfFolder, { recursive: true });
      }

      const imageFiles = await extractImagesFromPdf(pdfPath, currentPdfFolder);

      const imageDocs = imageFiles.map((img) => {

        const match = img.match(/image_(\d+)\.png$/);
        const page = parseInt(match[1], 10);

        return {
          bookletAnswerPdfId: currentPdf._id,
          name: img,
          page,
          status: "notVisited",
        };

      });

      extractedImages = await BookletAnswerPdfImage.insertMany(imageDocs);
    }

    const bookletImages = extractedImages.map((img) => ({
      page: img.page,
      image: img.name,
      url: `${extractedBookletPath}/${img.name}`,
    }));

    /* -------------------------------------------------------------------------- */
    /*                             ✅ FINAL RESPONSE                               */
    /* -------------------------------------------------------------------------- */

    return res.status(200).json({

      task,
      taskType: "booklet",

      remainingSeconds,

      answerPdfDetails: currentPdf,

      schemaDetails,

      extractedBookletPath,

      questionImagesFolderUrl,

      bookletImages,

    });

  } catch (error) {

    console.error("❌ Error fetching reviewer booklet task:", error);

    return res.status(500).json({
      message: "Failed to process reviewer booklet task",
      error: error.message,
    });

  }
};

// const pauseTask = async (req, res) => {
//   const { id } = req.params;

//   try {
//     if (!isValidObjectId(id)) {
//       return res.status(400).json({ message: "Invalid task ID." });
//     }

//     const task = await Task.findById(id);
//     console.log(task.remainingTimeInSec);
//     if (!task) {
//       return res.status(404).json({ message: "Task not found." });
//     }

//     // Task must be active and started
//     if (task.status !== "active") {
//       return res
//         .status(400)
//         .json({ message: "Only active tasks can be paused." });
//     }

//     if (!task.startTime) {
//       return res
//         .status(400)
//         .json({ message: "Start time not set for this task." });
//     }

//     // Get evaluation time from schema
//     const subject = await Subject.findOne({ code: task.subjectCode });
//     if (!subject) {
//       return res.status(404).json({ message: "Subject not found." });
//     }

//     const schemaRel = await SubjectSchemaRelation.findOne({
//       subjectId: subject._id,
//     });
//     if (!schemaRel) {
//       return res.status(404).json({ message: "Schema relation not found." });
//     }

//     const schema = await Schema.findById(schemaRel.schemaId);
//     if (!schema) {
//       return res.status(404).json({ message: "Schema not found." });
//     }

//     const evaluationTimeInMinutes = schema.evaluationTime;
//     if (
//       !evaluationTimeInMinutes ||
//       typeof evaluationTimeInMinutes !== "number"
//     ) {
//       return res
//         .status(400)
//         .json({ message: "Invalid evaluation time in schema." });
//     }

//     const now = new Date();

//     const lastResumedAt = new Date(task.lastResumedAt);
//     const elapsedSeconds = Math.floor((now - lastResumedAt) / 1000);

//     const prevRemaining =
//       task.remainingTimeInSec != null
//         ? task.remainingTimeInSec
//         : evaluationTimeInMinutes * 60;

//     let remainingSeconds = prevRemaining - elapsedSeconds;
//     if (remainingSeconds < 0) remainingSeconds = 0;

//     // Update the task
//     task.remainingTimeInSec = remainingSeconds;
//     task.status = "paused";

//     await task.save();

//     // Format to HH:mm:ss
//     const formatSecondsToHHMMSS = (totalSeconds) => {
//       const hrs = Math.floor(totalSeconds / 3600);
//       const mins = Math.floor((totalSeconds % 3600) / 60);
//       const secs = totalSeconds % 60;
//       return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
//         2,
//         "0"
//       )}:${String(secs).padStart(2, "0")}`;
//     };

//     return res.status(200).json({
//       message: "Task paused successfully.",

//       remainingTimeInSec: formatSecondsToHHMMSS(remainingSeconds),
//     });
//   } catch (err) {
//     console.error("Error in pauseTask:", err);
//     return res
//       .status(500)
//       .json({ message: "Failed to pause task", error: err.message });
//   }
// };

// const updateAssignedTask = async (req, res) => {
//   const { id } = req.params;
//   const { status, remainingTimeInSec } = req.body;

//   try {
//     if (!isValidObjectId(id)) {
//       return res.status(400).json({ message: "Invalid task ID." });
//     }

//     const task = await Task.findById(id);
//     if (!task) {
//       return res.status(404).json({ message: "Task not found." });
//     }

//     // Update task fields
//     if (status) task.status = status;
//     if (remainingTimeInSec !== undefined)
//       task.remainingTimeInSec = remainingTimeInSec;

//     await task.save();

//     return res
//       .status(200)
//       .json({ message: "Task updated successfully.", task });
//   } catch (err) {
//     console.error("Error in updateAssignedTask:", err);
//     return res
//       .status(500)
//       .json({ message: "Failed to update task", error: err.message });
//   }
// };

const removeAssignedTask = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid task ID." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const task = await Task.findById(id).session(session);
    if (!task) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Task not found" });
    }

    const countOfAnswerPdfs = await AnswerPdf.countDocuments({
      taskId: id,
    }).session(session);

    const subjectcode = task.subjectCode;
    console.log("subjectcode", subjectcode);

    const subject = await Subject.findOne({ code: subjectcode })
      .select("name")
      .session(session);

    if (!subject) {
      throw new Error("Subject not found");
    }

    await SubjectFolderModel.updateOne(
      { folderName: String(subjectcode) },
      {
        $inc: {
          unAllocated: countOfAnswerPdfs, // increment
          allocated: -countOfAnswerPdfs, // decrement
          evaluation_pending: -countOfAnswerPdfs, // decrement
        },
      },
      { session },
    );

    await AnswerPdf.deleteMany({ taskId: id }).session(session);
    await Task.findByIdAndDelete(id).session(session);
    console.log("task is deleted");

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Task and associated PDFs deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error during task and PDF deletion:", error);
    return res.status(500).json({
      message: "Failed to delete task and associated PDFs",
      error: error.message,
    });
  }
};
// const activeTimers = {}; // To track active timers per task

const waitForExtractedImages = async (
  answerPdfId,
  questiondefinitionId,
  timeoutMs = 8000,
  intervalMs = 500,
) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const images = await AnswerPdfImage.find({
      answerPdfId,
      questiondefinitionId,
    });

    if (images.length > 0) {
      return images;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return null; // timeout
};

const getAssignTaskById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    // Initialize task timing
    if (!task.startTime) {
      task.startTime = new Date();
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    }

    const subject = await Subject.findOne({ code: task.subjectCode });
    if (!subject) {
      return res
        .status(404)
        .json({ message: "Subject not found (create subject)." });
    }

    const courseSchemaRel = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    });
    if (!courseSchemaRel) {
      return res.status(404).json({
        message:
          "Schema not found for subject (upload master answer and master question).",
      });
    }

    const schemaDetails = await Schema.findById(courseSchemaRel.schemaId);
    if (!schemaDetails) {
      return res.status(404).json({ message: "Schema not found." });
    }

    const minTime = schemaDetails.minTime;
    const maxTime = schemaDetails.maxTime;

    // Calculate remaining time
    let remainingSeconds = 0;
    if (task.status === "paused" && task.remainingTimeInSec != null) {
      remainingSeconds = task.remainingTimeInSec;
      task.lastResumedAt = new Date();
      task.status = "active";
      await task.save();
    } else if (task.status === "active" && task.lastResumedAt) {
      const elapsedSeconds = Math.floor(
        (new Date() - task.lastResumedAt) / 1000,
      );
      remainingSeconds = Math.max(
        (task.remainingTimeInSec ?? maxTime * 60) - elapsedSeconds,
        0,
      );
    } else {
      remainingSeconds = maxTime * 60;
    }

    // Folder setup
    const rootFolder = path.join(__dirname, "processedFolder");
    const subjectFolder = path.join(rootFolder, task.subjectCode);

    if (!fs.existsSync(subjectFolder)) {
      return res.status(404).json({ message: "Subject folder not found." });
    }

    const extractedBookletsFolder = path.join(
      subjectFolder,
      "extractedBooklets",
    );
    if (!fs.existsSync(extractedBookletsFolder)) {
      fs.mkdirSync(extractedBookletsFolder, { recursive: true });
    }

    // Get assigned PDFs
    const assignedPdfs = await AnswerPdf.find({ taskId: task._id });

    // Update pending PDFs to "progress"
    await AnswerPdf.updateMany(
      {
        taskId: task._id,
        questiondefinitionId: task.questiondefinitionId,
        status: "false",
      },
      { $set: { status: "progress" } },
    );

    if (assignedPdfs.length === 0) {
      return res
        .status(404)
        .json({ message: "No PDFs assigned to this task." });
    }

    console.log(`📊 TOTAL PDFS ASSIGNED: ${assignedPdfs.length}`);

    const currentPdf = assignedPdfs[task.currentFileIndex - 1];
    if (!currentPdf) {
      return res
        .status(404)
        .json({ message: "No PDF found for the current file index." });
    }

    console.log(`📄 CURRENT PDF: ${currentPdf.answerPdfName}`);
    console.log(`📁 Current File Index: ${task.currentFileIndex}`);

    const pdfPath = path.join(subjectFolder, currentPdf.answerPdfName);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        message: `PDF file ${currentPdf.answerPdfName} not found.`,
      });
    }

    const bookletName = path.basename(currentPdf.answerPdfName, ".pdf");

    const currentPdfFolder = path.join(extractedBookletsFolder, bookletName);

    let extractedBookletPath = `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}`;

    // ✅ Build base URL for HTTP access
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const questionImagesFolderUrl = `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}/questionImages/${task.questiondefinitionId}`;

    // ✅ Check if images already extracted

    let extractedImages = await waitForExtractedImages(
      currentPdf._id,
      task.questiondefinitionId,
    );

    if (!extractedImages) {
      return res.status(202).json({
        message: "Question images are still processing",
        status: "PROCESSING",
      });
    }

    // let extractedImages = await AnswerPdfImage.find({
    //   answerPdfId: currentPdf._id,
    //   questiondefinitionId: task.questiondefinitionId, // ← ADD THIS
    // }).sort({ page: 1 });

    console.log(
      `🖼️ EXISTING EXTRACTED IMAGES IN DATABASE: ${extractedImages.length}`,
    );
    const questionDef = await QuestionDefinition.findById(
      task.questiondefinitionId,
    );

    const questionPages = new Set(questionDef.page);
    console.log("questionPages", questionPages);

    if (extractedImages.length === 0) {
      return res.status(202).json({
        message: "Question images are not ready yet",
        status: "PROCESSING",
      });
    }

    // ✅ If no images, extract them from PDF
    // if (extractedImages.length === 0) {
    //   console.log("📤 Extracting images from PDF for the first time...");

    //   if (!fs.existsSync(currentPdfFolder)) {
    //     fs.mkdirSync(currentPdfFolder, { recursive: true });
    //   }

    // const imageFiles = await extractImagesFromPdf(pdfPath, currentPdfFolder); // still all pages

    //   const imageDocs = imageFiles
    //     .map((imageFileName) => {
    //       const match = imageFileName.match(/image_(\d+)\.png$/);
    //       if (!match) return null;
    //       const pageNumber = parseInt(match[1], 10);

    //       // Only save pages that belong to this question
    //       if (!questionPages.has(pageNumber)) return null;

    //       return {
    //         answerPdfId: currentPdf._id,
    //         questiondefinitionId: questionDef._id,
    //         name: imageFileName,
    //         page: pageNumber,
    //         // ← add this field to schema if not already
    //         status: "notVisited",
    //       };
    //     })
    //     .filter(Boolean);

    //   if (imageDocs.length === 0) {
    //     console.warn(
    //       "No pages match this question definition → possible config error",
    //     );
    //   }

    //   extractedImages = await AnswerPdfImage.insertMany(imageDocs);

    //   // const imageDocs = imageFiles.map((imageFileName, ) => ({
    //   //   answerPdfId: currentPdf._id,
    //   //   questionDef,

    //   //   name: imageFileName,
    //   //   status: i === 0 ? "visited" : "notVisited",
    //   // }));

    //   // extractedImages = await AnswerPdfImage.insertMany(imageDocs);
    //   // console.log(`✅ Extracted ${extractedImages.length} images from PDF`);
    // }

    // ✅ Validate questionDefinitionId
    if (!task.questiondefinitionId) {
      return res.status(400).json({
        message: "Task missing questionDefinitionId",
      });
    }

    console.log("questionDefinitionId:", task.questiondefinitionId.toString());

    // ✅ Get question definition

    if (!questionDef || !questionDef.coordinates) {
      return res.status(404).json({
        message: "QuestionDefinition or coordinates not found",
      });
    }

    console.log(
      "Question coordinates:",
      JSON.stringify(questionDef.coordinates, null, 2),
    );

    // ✅ Extract question images
    const questionImagesFolder = path.join(
      currentPdfFolder,
      "questionImages",
      String(task.questiondefinitionId),
    );

    console.log("📁 Question images output folder:", questionImagesFolder);

    // When calling extractQuestionImages
    const relevantImages = extractedImages.filter((img) =>
      questionPages.has(img.page),
    );

    console.log("relevantImages:", relevantImages);

    const questionImages = await extractQuestionImages(
      questionDef.coordinates,
      relevantImages, // ← only pages of this question
      currentPdfFolder,
      questionImagesFolder,
    );

    console.log(`✅ Question images extracted: ${questionImages.length}`);

    // ✅ ADD URLs TO EACH QUESTION IMAGE
    const questionImagesWithUrls = questionImages.map((img) => ({
      ...img,
      url: `${questionImagesFolderUrl}/${img.image}`,
    }));

    console.log("questionimahgesurl", questionImagesWithUrls);

    // ✅ Return response with question images
    return res.status(200).json({
      task,
      questionDef,
      remainingSeconds,
      answerPdfDetails: currentPdf,
      schemaDetails,
      extractedBookletPath,
      questionImagesPath: `${extractedBookletPath}/questionImages/${task.questiondefinitionId}`,
      questionImagesFolderUrl, // ✅ Folder URL
      questionImages: questionImagesWithUrls, // ✅ Images with individual URLs
    });
  } catch (error) {
    console.error("❌ Error fetching task:", error.message);
    console.error(error.stack);
    res.status(500).json({
      message: "Failed to process task",
      error: error.message,
    });
  }
};
// const getAssignTaskById = async (req, res) => {
//   const { id } = req.params;

//   try {
//     if (!isValidObjectId(id)) {
//       return res.status(400).json({ message: "Invalid task ID." });
//     }

//     const task = await Task.findById(id);

//     if (!task) {
//       return res.status(404).json({ message: "Task not found." });
//     }

//     // Initialize task timing
//     if (!task.startTime) {
//       task.startTime = new Date();
//       task.lastResumedAt = new Date();
//       task.status = "active";
//       await task.save();
//     }

//     const subject = await Subject.findOne({ code: task.subjectCode });
//     if (!subject) {
//       return res
//         .status(404)
//         .json({ message: "Subject not found (create subject)." });
//     }

//     const courseSchemaRel = await SubjectSchemaRelation.findOne({
//       subjectId: subject._id,
//     });
//     if (!courseSchemaRel) {
//       return res.status(404).json({
//         message:
//           "Schema not found for subject (upload master answer and master question).",
//       });
//     }

//     const schemaDetails = await Schema.findById(courseSchemaRel.schemaId);
//     if (!schemaDetails) {
//       return res.status(404).json({ message: "Schema not found." });
//     }

//     const minTime = schemaDetails.minTime;
//     const maxTime = schemaDetails.maxTime;

//     // Calculate remaining time
//     let remainingSeconds = 0;
//     if (task.status === "paused" && task.remainingTimeInSec != null) {
//       remainingSeconds = task.remainingTimeInSec;
//       task.lastResumedAt = new Date();
//       task.status = "active";
//       await task.save();
//     } else if (task.status === "active" && task.lastResumedAt) {
//       const elapsedSeconds = Math.floor(
//         (new Date() - task.lastResumedAt) / 1000,
//       );
//       remainingSeconds = Math.max(
//         (task.remainingTimeInSec ?? maxTime * 60) - elapsedSeconds,
//         0,
//       );
//     } else {
//       remainingSeconds = maxTime * 60;
//     }

//     // Folder setup
//     const rootFolder = path.join(__dirname, "processedFolder");
//     const subjectFolder = path.join(rootFolder, task.subjectCode);

//     if (!fs.existsSync(subjectFolder)) {
//       return res.status(404).json({ message: "Subject folder not found." });
//     }

//     const extractedBookletsFolder = path.join(
//       subjectFolder,
//       "extractedBooklets",
//     );
//     if (!fs.existsSync(extractedBookletsFolder)) {
//       fs.mkdirSync(extractedBookletsFolder, { recursive: true });
//     }

//     // Get assigned PDFs
//     const assignedPdfs = await AnswerPdf.find({ taskId: task._id });

//     // Update pending PDFs to "progress"
//     await AnswerPdf.updateMany(
//       {
//         taskId: task._id,
//         questiondefinitionId: task.questiondefinitionId,
//         status: "false",
//       },
//       { $set: { status: "progress" } },
//     );

//     if (assignedPdfs.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No PDFs assigned to this task." });
//     }

//     console.log(`📊 TOTAL PDFS ASSIGNED: ${assignedPdfs.length}`);

//     const currentPdf = assignedPdfs[task.currentFileIndex - 1];
//     if (!currentPdf) {
//       return res
//         .status(404)
//         .json({ message: "No PDF found for the current file index." });
//     }

//     console.log(`📄 CURRENT PDF: ${currentPdf.answerPdfName}`);
//     console.log(`📁 Current File Index: ${task.currentFileIndex}`);

//     const pdfPath = path.join(subjectFolder, currentPdf.answerPdfName);
//     if (!fs.existsSync(pdfPath)) {
//       return res.status(404).json({
//         message: `PDF file ${currentPdf.answerPdfName} not found.`,
//       });
//     }

//     const bookletName = path.basename(currentPdf.answerPdfName, ".pdf");

//     const currentPdfFolder = path.join(extractedBookletsFolder, bookletName);

//     let extractedBookletPath = `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}`;

//     // ✅ Build base URL for HTTP access
//     const baseUrl = `${req.protocol}://${req.get("host")}`;

//     const questionImagesFolderUrl = `processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}/questionImages/${task.questiondefinitionId}`;

//     // ✅ Check if images already extracted
//     let extractedImages = await AnswerPdfImage.find({
//       answerPdfId: currentPdf._id,
//       questiondefinitionId: task.questiondefinitionId, // ← ADD THIS
//     }).sort({ page: 1 });

//     console.log(
//       `🖼️ EXISTING EXTRACTED IMAGES IN DATABASE: ${extractedImages.length}`,
//     );
//     const questionDef = await QuestionDefinition.findById(
//       task.questiondefinitionId,
//     );

//     const questionPages = new Set(questionDef.page);
//     console.log("questionPages", questionPages);

//     // ✅ If no images, extract them from PDF
//     if (extractedImages.length === 0) {
//       console.log("📤 Extracting images from PDF for the first time...");

//       if (!fs.existsSync(currentPdfFolder)) {
//         fs.mkdirSync(currentPdfFolder, { recursive: true });
//       }

//       const imageFiles = await extractImagesFromPdf(pdfPath, currentPdfFolder); // still all pages

//       const imageDocs = imageFiles
//         .map((imageFileName) => {
//           const match = imageFileName.match(/image_(\d+)\.png$/);
//           if (!match) return null;
//           const pageNumber = parseInt(match[1], 10);

//           // Only save pages that belong to this question
//           if (!questionPages.has(pageNumber)) return null;

//           return {
//             answerPdfId: currentPdf._id,
//             questiondefinitionId: questionDef._id,
//             name: imageFileName,
//             page: pageNumber,
//             // ← add this field to schema if not already
//             status: "notVisited",
//           };
//         })
//         .filter(Boolean);

//       if (imageDocs.length === 0) {
//         console.warn(
//           "No pages match this question definition → possible config error",
//         );
//       }

//       extractedImages = await AnswerPdfImage.insertMany(imageDocs);

//       // const imageDocs = imageFiles.map((imageFileName, ) => ({
//       //   answerPdfId: currentPdf._id,
//       //   questionDef,

//       //   name: imageFileName,
//       //   status: i === 0 ? "visited" : "notVisited",
//       // }));

//       // extractedImages = await AnswerPdfImage.insertMany(imageDocs);
//       // console.log(`✅ Extracted ${extractedImages.length} images from PDF`);
//     }

//     // ✅ Validate questionDefinitionId
//     if (!task.questiondefinitionId) {
//       return res.status(400).json({
//         message: "Task missing questionDefinitionId",
//       });
//     }

//     console.log("questionDefinitionId:", task.questiondefinitionId.toString());

//     // ✅ Get question definition

//     if (!questionDef || !questionDef.coordinates) {
//       return res.status(404).json({
//         message: "QuestionDefinition or coordinates not found",
//       });
//     }

//     console.log(
//       "Question coordinates:",
//       JSON.stringify(questionDef.coordinates, null, 2),
//     );

//     // ✅ Extract question images
//     const questionImagesFolder = path.join(
//       currentPdfFolder,
//       "questionImages",
//       String(task.questiondefinitionId),
//     );

//     console.log("📁 Question images output folder:", questionImagesFolder);

//     // When calling extractQuestionImages
//     const relevantImages = extractedImages.filter((img) =>
//       questionPages.has(img.page),
//     );

//     console.log("relevantImages:", relevantImages);

//     const questionImages = await extractQuestionImages(
//       questionDef.coordinates,
//       relevantImages, // ← only pages of this question
//       currentPdfFolder,
//       questionImagesFolder,
//     );

//     console.log(`✅ Question images extracted: ${questionImages.length}`);

//     // ✅ ADD URLs TO EACH QUESTION IMAGE
//     const questionImagesWithUrls = questionImages.map((img) => ({
//       ...img,
//       url: `${questionImagesFolderUrl}/${img.image}`,
//     }));

//     console.log("questionimahgesurl", questionImagesWithUrls);

//     // ✅ Return response with question images
//     return res.status(200).json({
//       task,
//       questionDef,
//       remainingSeconds,
//       answerPdfDetails: currentPdf,
//       schemaDetails,
//       extractedBookletPath,
//       questionImagesPath: `${extractedBookletPath}/questionImages/${task.questiondefinitionId}`,
//       questionImagesFolderUrl, // ✅ Folder URL
//       questionImages: questionImagesWithUrls, // ✅ Images with individual URLs
//     });
//   } catch (error) {
//     console.error("❌ Error fetching task:", error.message);
//     console.error(error.stack);
//     res.status(500).json({
//       message: "Failed to process task",
//       error: error.message,
//     });
//   }
// };
// Utility to clear interval for a task

// const getAssignTaskById = async (req, res) => {
//   const { id } = req.params;

//   // ✅ SSE HEADERS (MANDATORY)
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   res.flushHeaders();

//   try {
//     if (!isValidObjectId(id)) {
//       res.write(
//         `event: error\ndata: ${JSON.stringify({ message: "Invalid task ID" })}\n\n`,
//       );
//       return res.end();
//     }

//     const task = await Task.findById(id);
//     if (!task) {
//       res.write(
//         `event: error\ndata: ${JSON.stringify({ message: "Task not found" })}\n\n`,
//       );
//       return res.end();
//     }

//     // Initialize task timing
//     if (!task.startTime) {
//       task.startTime = new Date();
//       task.lastResumedAt = new Date();
//       task.status = "active";
//       await task.save();
//     }

//     const subject = await Subject.findOne({ code: task.subjectCode });
//     if (!subject) {
//       res.write(
//         `event: error\ndata: ${JSON.stringify({ message: "Subject not found" })}\n\n`,
//       );
//       return res.end();
//     }

//     const courseSchemaRel = await SubjectSchemaRelation.findOne({
//       subjectId: subject._id,
//     });
//     if (!courseSchemaRel) {
//       res.write(
//         `event: error\ndata: ${JSON.stringify({ message: "Schema not found" })}\n\n`,
//       );
//       return res.end();
//     }

//     const schemaDetails = await Schema.findById(courseSchemaRel.schemaId);
//     if (!schemaDetails) {
//       res.write(
//         `event: error\ndata: ${JSON.stringify({ message: "Schema details missing" })}\n\n`,
//       );
//       return res.end();
//     }

//     // Remaining time calculation
//     let remainingSeconds = schemaDetails.maxTime * 60;
//     if (task.status === "paused" && task.remainingTimeInSec != null) {
//       remainingSeconds = task.remainingTimeInSec;
//     }

//     // ✅ SEND INITIAL METADATA FIRST
//     res.write(
//       `event: init\ndata: ${JSON.stringify({
//         taskId: task._id,
//         subjectCode: task.subjectCode,
//         questiondefinitionId: task.questiondefinitionId,
//         remainingSeconds,
//         message: "Task initialized, streaming images",
//       })}\n\n`,
//     );

//     // Folder setup
//     const rootFolder = path.join(__dirname, "processedFolder");
//     const subjectFolder = path.join(rootFolder, task.subjectCode);

//     const assignedPdfs = await AnswerPdf.find({ taskId: task._id });
//     if (!assignedPdfs.length) {
//       res.write(
//         `event: error\ndata: ${JSON.stringify({ message: "No PDFs assigned" })}\n\n`,
//       );
//       return res.end();
//     }

//     const currentPdf = assignedPdfs[task.currentFileIndex - 1];
//     const pdfPath = path.join(subjectFolder, currentPdf.answerPdfName);

//     const bookletName = path.basename(currentPdf.answerPdfName, ".pdf");
//     const extractedBookletsFolder = path.join(
//       subjectFolder,
//       "extractedBooklets",
//     );
//     const currentPdfFolder = path.join(extractedBookletsFolder, bookletName);

//     if (!fs.existsSync(currentPdfFolder)) {
//       fs.mkdirSync(currentPdfFolder, { recursive: true });
//     }

//     const questionDef = await QuestionDefinition.findById(
//       task.questiondefinitionId,
//     );
//     const questionPages = new Set(questionDef.page);

//     let extractedImages = await AnswerPdfImage.find({
//       answerPdfId: currentPdf._id,
//       questiondefinitionId: task.questiondefinitionId,
//     }).sort({ page: 1 });

//     if (!extractedImages.length) {
//       const imageFiles = await extractImagesFromPdf(pdfPath, currentPdfFolder);

//       const imageDocs = imageFiles
//         .map((name) => {
//           const m = name.match(/image_(\d+)\.png$/);
//           if (!m) return null;
//           const page = parseInt(m[1], 10);
//           if (!questionPages.has(page)) return null;
//           return {
//             answerPdfId: currentPdf._id,
//             questiondefinitionId: questionDef._id,
//             name,
//             page,
//             status: "notVisited",
//           };
//         })
//         .filter(Boolean);

//       extractedImages = await AnswerPdfImage.insertMany(imageDocs);
//     }

//     const questionImagesFolder = path.join(
//       currentPdfFolder,
//       "questionImages",
//       String(task.questiondefinitionId),
//     );
//     const baseUrl = `${req.protocol}://${req.get("host")}`;

//     const questionImagesFolderUrl = `${baseUrl}/processedFolder/${task.subjectCode}/extractedBooklets/${bookletName}/questionImages/${task.questiondefinitionId}`;

//     // 🔥 STREAM IMAGES ONE BY ONE
//     for (const img of extractedImages) {
//       const croppedImages = await extractQuestionImages(
//         questionDef.coordinates,
//         [img],
//         currentPdfFolder,
//         questionImagesFolder,
//       );

//       if (!croppedImages.length) continue;

//       res.write(
//         `event: image\ndata: ${JSON.stringify({
//           page: img.page,
//           image: croppedImages[0].image,
//           url: `${questionImagesFolderUrl}/${croppedImages[0].image}`,
//         })}\n\n`,
//       );
//     }

//     // ✅ FINISH STREAM
//     res.write(
//       `event: done\ndata: ${JSON.stringify({ message: "All images streamed" })}\n\n`,
//     );
//     res.end();
//   } catch (error) {
//     console.error(error);
//     res.write(
//       `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`,
//     );
//     res.end();
//   }
// };

const getAllTaskHandler = async (req, res) => {
  try {
    // 🔹 Question-wise tasks
    const questionTasks = await Task.find().populate("userId", "name email");

    // 🔹 Booklet-wise tasks
    const bookletTasks = await BookletTask.find().populate(
      "userId",
      "name email",
    );

    // 🔹 Scanner tasks (unchanged)
    const scannerTasks = await ScannerTask.find().populate(
      "userId",
      "subjectCode",
    );

    // ✅ Merge question + booklet tasks
    const tasks = [...questionTasks, ...bookletTasks];

    res.status(200).json({
      tasks, // now contains BOTH
      scannerTasks, // unchanged
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({
      message: "Failed to fetch tasks",
      error: error.message,
    });
  }
};

const getAllScannerTasks = async (req, res) => {
  try {
    const scannerTasks = await ScannerTask.find({
      status: { $ne: "success" }
    }).populate("userId");

    res.status(200).json({
      success: true,
      count: scannerTasks.length,
      data: scannerTasks
    });

  } catch (error) {
    console.error("Error fetching scanner tasks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch scanner tasks",
      error: error.message,
    });
  }
};

const getAllAssignedTaskByUserId = async (req, res) => {
  const { userId } = req.params;

  try {
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user ID." });
    }

    // 🔹 1️⃣ Question-wise Tasks
    const questionTasks = await Task.find({
      userId,
      status: { $ne: "success" },
    }).lean();

    // 🔹 2️⃣ Booklet-wise Tasks
    const bookletTasks = await BookletTask.find({
      userId,
      status: { $ne: "success" },
    }).lean();

    // 🔹 3️⃣ Add taskType for frontend clarity
    const formattedQuestionTasks = questionTasks.map((task) => ({
      ...task,
      taskType: "question",
    }));

    const formattedBookletTasks = bookletTasks.map((task) => ({
      ...task,
      taskType: "booklet",
    }));

    const allTasks = [...formattedQuestionTasks, ...formattedBookletTasks];

    if (allTasks.length === 0) {
      return res.status(200).json([]);
    }

    return res.status(200).json(allTasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return res.status(500).json({
      message: "Failed to fetch tasks",
      error: error.message,
    });
  }
};

const updateCurrentIndex = async (req, res) => {
  const { id } = req.params;
  const { currentIndex } = req.body;

  try {
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    if (!currentIndex) {
      return res.status(400).json({ message: "Invalid current index." });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Ensure currentIndex is a valid number and within the range of totalFiles
    if (currentIndex < 1 || currentIndex > task.totalFiles) {
      return res.status(400).json({
        message: `currentIndex should be between 1 and ${task.totalFiles}`,
      });
    }

    // Update currentFileIndex
    task.currentFileIndex = currentIndex;
    await task.save();

    res.status(200).json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    res
      .status(500)
      .json({ message: "Failed to update task", error: error.message });
  }
};

const getQuestionDefinitionTaskId = async (req, res) => {
  const { answerPdfId, taskId } = req.query;

  try {
    // Validate IDs
    if (!isValidObjectId(taskId)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    if (!isValidObjectId(answerPdfId)) {
      return res.status(400).json({ message: "Invalid answerPdfId." });
    }

    // Retrieve the task
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const subject = await Subject.findOne({ code: task.subjectCode });

    if (!subject) {
      return res
        .status(404)
        .json({ message: "Subject not found (create subject)." });
    }

    const courseSchemaDetails = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    });

    if (!courseSchemaDetails) {
      return res.status(404).json({
        message:
          "Schema not found for the subject (upload master answer and master question).",
      });
    }

    const schemaDetails = await Schema.findOne({
      _id: courseSchemaDetails.schemaId,
    });

    if (!schemaDetails) {
      return res.status(404).json({ message: "Schema not found." });
    }

    // Fetch all QuestionDefinitions for the schema
    const questionDefinitions = await QuestionDefinition.find({
      schemaId: schemaDetails.id,
    });

    if (!questionDefinitions || questionDefinitions.length === 0) {
      return res.status(404).json({ message: "No QuestionDefinitions found" });
    }

    // Fetch Marks data based on the provided answerPdfId and questionDefinitionId
    const marksData = await Marks.find({ answerPdfId: answerPdfId });

    // Add marks related data to the question definitions
    const enrichedQuestionDefinitions = await Promise.all(
      questionDefinitions.map(async (question) => {
        // Find the related Marks entry for the current questionDefinitionId
        const marks = marksData.find(
          (m) => m.questionDefinitionId.toString() === question._id.toString(),
        );

        // If Marks entry exists, add its data, otherwise leave as empty
        const marksInfo = marks
          ? {
              allottedMarks: marks.allottedMarks,
              answerPdfId: marks.answerPdfId,
              timerStamps: marks.timerStamps,
              isMarked: marks.isMarked,
            }
          : {
              allottedMarks: 0,
              answerPdfId: answerPdfId,
              timerStamps: "",
              isMarked: false,
            };

        // Return the enriched question with Marks data
        return {
          ...question.toObject(),
          ...marksInfo,
        };
      }),
    );

    // Send the enriched data as a response
    res.status(200).json(enrichedQuestionDefinitions);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch tasks", error: error.message });
  }
};

const getAllTasksBasedOnSubjectCode = async (req, res) => {
  const { subjectcode } = req.query;

  try {
    if (!subjectcode) {
      return res.status(400).json({ message: "Subject code is required." });
    }

    const tasks = await Task.find({ subjectCode: subjectcode }).populate(
      "userId",
      "name email",
    );

    res.status(200).json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch tasks", error: error.message });
  }
};

const getUsersFormanualAssign = async (req, res) => {
  const { subjectCode } = req.params;

  let usersFormanualAssign = [];

  try {
    const subject = await Subject.findOne({ code: subjectCode });

    if (!subject) {
      return res.status(404).json({ message: "Invalid subject code" });
    }

    const subjectId = subject._id;

    // All users mapped to this subject
    const users = await User.find({ subjectCode: subjectId });

    for (const user of users) {
      const maximumBooklets = user.maxBooklets || 0;
      console.log("maximumBooklets", maximumBooklets);

      // IMPORTANT: ensure Task.subjectCode matches correct field type
      const result = await Task.aggregate([
        {
          $match: { userId: user._id, status: { $in: ["active", "inactive"] } },
        },
        { $group: { _id: null, total: { $sum: "$totalBooklets" } } },
      ]);

      const assignedBooklets = result.length ? result[0].total : 0;
      console.log("assignedBooklets", assignedBooklets);

      usersFormanualAssign.push({
        userId: user._id,
        name: user.name,
        email: user.email,
        maxBooklets: maximumBooklets,
        role: user.role,
        assignedBooklets,
        remaining: maximumBooklets - assignedBooklets,
      });
    }

    return res.status(200).json(usersFormanualAssign);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

// const completedBookletHandler = async (req, res) => {
//   const { answerpdfid } = req.params;

//   try {
//     // Validate answerPdfId
//     if (!isValidObjectId(answerpdfid)) {
//       return res.status(400).json({ message: "Invalid task ID." });
//     }

//     const currentPdf = await AnswerPdf.findOne({ _id: answerpdfid });
//     if (!currentPdf) {
//       return res
//         .status(404)
//         .json({ message: "No PDF found for the current file index." });
//     }

//     const task = await Task.findById(currentPdf.taskId);
//     if (!task) {
//       return res.status(404).json({ message: "Task not found." });
//     }

// Find all tasks related to the same subjectCode
// const tasks = await Task.find({ subjectCode: task.subjectCode });

//     // Check if all images are annotated
//     const answerPdfImages = await AnswerPdfImage.find({
//       answerPdfId: currentPdf._id,
//     });
//     const iconsCheck = await Promise.all(
//       answerPdfImages.map(async (answerPdfImage) => {
//         const iconExists = await Icon.findOne({
//           answerPdfImageId: answerPdfImage._id,
//         });
//         return iconExists;
//       })
//     );

//     // if (iconsCheck.includes(null)) {
//     //   return res.status(404).json({
//     //     message: "Ensure all answer sheets are annotated/marked.",
//     //     success: false,
//     //   });
//     // }

//     // Update AnswerPdf status to 'true'
//     await AnswerPdf.findByIdAndUpdate(currentPdf._id, { status: "true" });

//     let totalBooklets = 0;
//     let completedBooklets = 0;

//     // Process each task and update the booklet counts
//     for (const currentTask of tasks) {
//       const answerPdfs = await AnswerPdf.find({
//         taskId: currentTask._id,
//         status: "true",
//       });
//       totalBooklets += currentTask.totalBooklets;
//       completedBooklets += answerPdfs.length;
//     }

//     const subjectFolderDetails = await SubjectFolderModel.findOne({
//       folderName: task.subjectCode,
//     });
//     if (!subjectFolderDetails) {
//       return res.status(404).json({ message: "Subject folder not found" });
//     }

//     // Update folder details
//     subjectFolderDetails.evaluated = completedBooklets;
//     subjectFolderDetails.evaluation_pending = totalBooklets - completedBooklets;
//     await subjectFolderDetails.save();

//     // Check if all booklets are completed
//     if (completedBooklets === totalBooklets) {
//       task.status = "success";
//       await task.save();
//       return res
//         .status(200)
//         .json({ message: "Task is completed", success: true });
//     }

//     res.status(200).json({
//       message: "All images have been annotated/marked.",
//       success: true,
//     });
//   } catch (error) {
//     console.error("Error in completedBookletHandler:", error);
//     res
//       .status(500)
//       .json({ message: "Failed to complete task", error: error.message });
//   }
// }

// const completedBookletHandler = async (req, res) => {
//   try {
//     const { answerpdfid, userId } = req.params;
//     const { submitted } = req.body;

//     const taskDoc = await AnswerPdf.findById(answerpdfid)
//       .select("taskId")
//       .lean();

//     const taskId = taskDoc?.taskId;

//     console.log("taskId", taskId);

//     const taskData = await Task.findById(taskId).select("subjectCode").lean();

//     const subjectCode = taskData?.subjectCode;

//     console.log("subjectCode", subjectCode);

//     const questiondefinitionId = taskData.questiondefinitionId;

//     // 1️⃣ Get subject
//     const subject = await Subject.findOne({ code: subjectCode })
//       .select("_id")
//       .lean();

//     if (!subject) {
//       return res.status(404).json({
//         success: false,
//         message: "Subject not found",
//       });
//     }

//     // 2️⃣ Get subject-schema relation
//     const schemaRelation = await SubjectSchemaRelation.findOne({
//       subjectId: subject._id,
//     })
//       .select("schemaId")
//       .lean();

//     if (!schemaRelation) {
//       return res.status(404).json({
//         success: false,
//         message: "Schema relation not found for subject",
//       });
//     }

//     // 3️⃣ Get schema timing
//     const schemaDoc = await Schema.findById(schemaRelation.schemaId)
//       .select("minTime maxTime")
//       .lean();

//     const minTime = schemaDoc?.minTime;
//     const maxTime = schemaDoc?.maxTime;

//     console.log(minTime);
//     console.log(maxTime);

//     if (minTime == null || maxTime == null) {
//       return res.status(400).json({
//         success: false,
//         message: "Schema timing configuration missing",
//       });
//     }

//     console.log("minTime, maxTime", minTime, maxTime);

//     const effectiveTime = Math.max(minTime, submitted);

//     const efficiency = Math.max(
//       0,
//       Math.min(
//         100,
//         Math.round(((maxTime - effectiveTime) / (maxTime - minTime)) * 100),
//       ),
//     );

//     // 6️⃣ PUSH efficiency into array
//     await Task.updateOne(
//       {
//         _id: taskId,
//         userId,
//         subjectCode,
//         questiondefinitionId
//       },
//       {
//         $push: { efficiency },
//       },
//     );

//     await User.updateOne(
//       { _id: userId },
//       {
//         $push: { efficiency },
//       },
//     );

//     if (!answerpdfid) {
//       return res.status(400).json({
//         success: false,
//         message: "answerpdfid is required",
//       });
//     }

//     console.log("Starting sync for booklet:", answerpdfid);

//     const folderPath = path.join(
//       "Annotations",
//       String(userId),
//       String(answerpdfid),
//     );

//     if (!fs.existsSync(folderPath)) {
//       return res.status(404).json({
//         success: false,
//         message: "Annotations folder not found",
//       });
//     }

//     // Get all page JSON files
//     const files = fs
//       .readdirSync(folderPath)
//       .filter((file) => file.startsWith("page_") && file.endsWith(".json"));

//     let bulkOps = [];

//     for (const file of files) {
//       const pageNumber = Number(file.replace("page_", "").replace(".json", ""));
//       const filePath = path.join(folderPath, file);

//       let jsonData;

//       try {
//         jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));
//       } catch (err) {
//         console.log(`⚠ Skipping invalid JSON: ${file}`);
//         continue;
//       }

//       const annotations = jsonData.annotations || [];

//       for (const a of annotations) {
//         // Skip if required fields missing
//         if (
//           !a.id ||
//           !a.answerPdfImageId ||
//           !a.questionDefinitionId ||
//           !a.iconUrl ||
//           !a.question ||
//           !a.timeStamps
//         ) {
//           console.log("⚠ Skipping incomplete annotation:", a);
//           continue;
//         }

//         bulkOps.push({
//           updateOne: {
//             filter: { annotationId: a.id }, // custom ID
//             update: {
//               $set: {
//                 annotationId: a.id,
//                 answerPdfImageId: a.answerPdfImageId,
//                 questionDefinitionId: a.questionDefinitionId,
//                 iconUrl: a.iconUrl,
//                 question: String(a.question),
//                 timeStamps: a.timeStamps,
//                 x: String(a.x),
//                 y: String(a.y),
//                 width: String(a.width),
//                 height: String(a.height),
//                 mark: String(a.mark),
//                 comment: a.comment ?? "",
//                 answerPdfId: a.answerPdfId,
//                 page: pageNumber,
//                 updatedAt: new Date(),
//               },
//             },
//             upsert: true,
//           },
//         });
//       }
//     }

//     if (bulkOps.length > 0) {
//       await Icon.bulkWrite(bulkOps);
//       console.log(`✅ Synced ${bulkOps.length} icons`);
//     } else {
//       console.log("⚠ No annotations found.");
//     }

//     const marksFile = path.join(folderPath, "marks.json");

//     if (fs.existsSync(marksFile)) {
//       const marksJSON = JSON.parse(fs.readFileSync(marksFile, "utf8"));

//       const marksArray = marksJSON.marks || [];
//       let markOps = [];

//       for (const m of marksArray) {
//         if (
//           !m.questionDefinitionId ||
//           !m.answerPdfId ||
//           m.allottedMarks === undefined
//         ) {
//           console.log("⚠ Skipping invalid mark:", m);
//           continue;
//         }

//         markOps.push({
//           updateOne: {
//             filter: {
//               questionDefinitionId: m.questionDefinitionId,
//               answerPdfId: m.answerPdfId,
//             },
//             update: {
//               $set: {
//                 allottedMarks: Number(m.allottedMarks),
//                 timerStamps: String(m.timeStamps ?? ""),
//                 isMarked: Boolean(m.synced ?? false),
//                 updatedAt: new Date(),
//               },
//             },
//             upsert: true,
//           },
//         });
//       }

//       if (markOps.length > 0) {
//         await Marks.bulkWrite(markOps);
//         console.log(`✅ Synced ${markOps.length} marks`);
//       }
//     } else {
//       console.log("⚠ marks.json not found");
//     }

//     const answerPdfDoc = await AnswerPdf.findByIdAndUpdate(answerpdfid, questiondefinitionId {
//       status: "true",
//     });
//     console.log("✅ Updated AnswerPdf status to true");

//     const task = await Task.findById(answerPdfDoc.taskId);

//     // Process each task and update the booklet counts

//     task.totalBooklets -= 1;
//     await task.save();

//     const subjectFolderDetails = await SubjectFolderModel.findOne({
//       folderName: task.subjectCode,
//     });
//     if (!subjectFolderDetails) {
//       return res.status(404).json({ message: "Subject folder not found" });
//     }

//     // Update folder details
//     subjectFolderDetails.evaluated += 1;
//     subjectFolderDetails.evaluation_pending -= 1;
//     subjectFolderDetails.allocated -= 1;
//     await subjectFolderDetails.save();

//     // Check if all booklets are completed
//     if (task.totalBooklets === 0) {
//       task.status = "success";
//       await task.save();
//       return res
//         .status(200)
//         .json({ message: "Task is completed", success: true });
//     } else {
//       //passed to the next booklet and along with response that booklet annotations synced successfully
//       return res.status(200).json({
//         success: true,
//         message: "Booklet submitted successfully",
//         taskCompleted: false,
//         currentAnswerPdfId: answerpdfid,
//       });
//     }

//     // return res.status(200).json({
//     //   success: true,
//     //   message: "Booklet annotations synced successfully",
//     //   totalSynced: bulkOps.length,
//     //   answerPdfId: answerpdfid,
//     // });
//   } catch (error) {
//     console.error("❌ Error in completedBookletHandler:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
const completedBookletHandler = async (req, res) => {
  try {
    const { answerpdfid, userId } = req.params;
    const { submitted } = req.body;

    const taskDoc = await AnswerPdf.findById(answerpdfid)
      .select("taskId")
      .lean();

    const taskId = taskDoc?.taskId;

    console.log("taskId", taskId);

    const taskData = await Task.findById(taskId).select("subjectCode").lean();

    const subjectCode = taskData?.subjectCode;

    console.log("subjectCode", subjectCode);

    const questiondefinitionId = taskData.questiondefinitionId;

    // 1️⃣ Get subject
    const subject = await Subject.findOne({ code: subjectCode })
      .select("_id")
      .lean();

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    // 2️⃣ Get subject-schema relation
    const schemaRelation = await SubjectSchemaRelation.findOne({
      subjectId: subject._id,
    })
      .select("schemaId")
      .lean();

    if (!schemaRelation) {
      return res.status(404).json({
        success: false,
        message: "Schema relation not found for subject",
      });
    }

    // 3️⃣ Get schema timing
    const schemaDoc = await Schema.findById(schemaRelation.schemaId)
      .select("minTime maxTime")
      .lean();

    const minTime = schemaDoc?.minTime;
    const maxTime = schemaDoc?.maxTime;

    console.log(minTime);
    console.log(maxTime);

    if (minTime == null || maxTime == null) {
      return res.status(400).json({
        success: false,
        message: "Schema timing configuration missing",
      });
    }

    console.log("minTime, maxTime", minTime, maxTime);

    // const effectiveTime = Math.max(minTime, submitted);

    const submittedTime = Number(submitted);

    if (!Number.isFinite(submittedTime)) {
      return res.status(400).json({
        success: false,
        message: "Invalid submitted time",
      });
    }

    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schema timing values",
      });
    }

    // 🚨 CRITICAL GUARD
    if (maxTime <= minTime) {
      return res.status(400).json({
        success: false,
        message:
          "Schema configuration error: maxTime must be greater than minTime",
      });
    }

    const effectiveTime = Math.max(minTime, submittedTime);

    const efficiency = Math.round(
      ((maxTime - effectiveTime) / (maxTime - minTime)) * 100,
    );

    // 🔒 FINAL SAFETY
    if (!Number.isFinite(efficiency)) {
      console.error("❌ Efficiency NaN detected:", {
        minTime,
        maxTime,
        submittedTime,
        effectiveTime,
      });

      return res.status(400).json({
        success: false,
        message: "Efficiency calculation failed",
      });
    }

    // 6️⃣ PUSH efficiency into array
    await Task.updateOne(
      {
        _id: taskId,
        userId,
        subjectCode,
        questiondefinitionId,
      },
      {
        // $push: { efficiency },
      },
    );

    await User.updateOne(
      { _id: userId },
      {
        $push: { efficiency },
      },
    );

    if (!answerpdfid) {
      return res.status(400).json({
        success: false,
        message: "answerpdfid is required",
      });
    }

    console.log("Starting sync for booklet:", answerpdfid);

    const folderPath = path.join(
      "Annotations",
      String(userId),
      String(answerpdfid),
    );

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({
        success: false,
        message: "Annotations folder not found",
      });
    }

    // Get all page JSON files
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => file.startsWith("page_") && file.endsWith(".json"));

    let bulkOps = [];

    for (const file of files) {
      const pageNumber = Number(file.replace("page_", "").replace(".json", ""));
      const filePath = path.join(folderPath, file);

      let jsonData;

      try {
        jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (err) {
        console.log(`⚠ Skipping invalid JSON: ${file}`);
        continue;
      }

      const annotations = jsonData.annotations || [];

      for (const a of annotations) {
        // Skip if required fields missing
        if (
          !a.id ||
          !a.answerPdfImageId ||
          !a.questionDefinitionId ||
          !a.iconUrl ||
          !a.question ||
          !a.timeStamps
        ) {
          console.log("⚠ Skipping incomplete annotation:", a);
          continue;
        }

        bulkOps.push({
          updateOne: {
            filter: { annotationId: a.id }, // custom ID
            update: {
              $set: {
                annotationId: a.id,
                answerPdfImageId: a.answerPdfImageId,
                questionDefinitionId: a.questionDefinitionId,
                iconUrl: a.iconUrl,
                question: String(a.question),
                timeStamps: a.timeStamps,
                x: String(a.x),
                y: String(a.y),
                width: String(a.width),
                height: String(a.height),
                mark: String(a.mark),
                comment: a.comment ?? "",
                answerPdfId: a.answerPdfId,
                page: pageNumber,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await Icon.bulkWrite(bulkOps);
      console.log(`✅ Synced ${bulkOps.length} icons`);
    } else {
      console.log("⚠ No annotations found.");
    }

    const marksFile = path.join(folderPath, "marks.json");

    if (fs.existsSync(marksFile)) {
      const marksJSON = JSON.parse(fs.readFileSync(marksFile, "utf8"));

      const marksArray = marksJSON.marks || [];
      let markOps = [];

      for (const m of marksArray) {
        if (
          !m.questionDefinitionId ||
          !m.answerPdfId ||
          m.allottedMarks === undefined
        ) {
          console.log("⚠ Skipping invalid mark:", m);
          continue;
        }

        markOps.push({
          updateOne: {
            filter: {
              questionDefinitionId: m.questionDefinitionId,
              answerPdfId: m.answerPdfId,
            },
            update: {
              $set: {
                allottedMarks: Number(m.allottedMarks),
                timerStamps: String(m.timeStamps ?? ""),
                isMarked: Boolean(m.synced ?? false),
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }

      if (markOps.length > 0) {
        await Marks.bulkWrite(markOps);
        console.log(`✅ Synced ${markOps.length} marks`);
      }
    } else {
      console.log("⚠ marks.json not found");
    }

    const answerPdfDoc = await AnswerPdf.findOneAndUpdate(
      {
        _id: answerpdfid,
        questionDefinitionId: questiondefinitionId, // ← must already match
      },
      {
        $set: {
          status: "true",
          evaluatedAt: new Date(),
          // maybe also: evaluatedBy: req.user._id
        },
      },
      { new: true },
    );
    console.log("✅ Updated AnswerPdf status to true");

    const task = await Task.findById(answerPdfDoc.taskId);

    // if (task.status === "success") {
    //  return res.status(400).json({
    //     success: false,
    //     message: "Task already completed",
    //  });
    // }

    // Process each task and update the booklet counts

    // task.totalBooklets -= 1;
    // await task.save();

    const pendingExists = await AnswerPdf.exists({
      answerPdfName: answerPdfDoc.answerPdfName,
      status: "false",
    });

    if (!pendingExists) {
      await SubjectFolderModel.updateOne(
        { folderName: task.subjectCode },
        {
          $inc: {
            evaluated: 1,
            evaluation_pending: -1,
            allocated: -1,
          },
        },
      );
    }

    // const subjectFolderDetails = await SubjectFolderModel.findOne({
    //   folderName: task.subjectCode,
    // });
    // if (!subjectFolderDetails) {
    //   return res.status(404).json({ message: "Subject folder not found" });
    // }

    // // Update folder details
    // subjectFolderDetails.evaluated += 1;
    // subjectFolderDetails.evaluation_pending -= 1;
    // subjectFolderDetails.allocated -= 1;
    // await subjectFolderDetails.save();

    if (task.currentFileIndex < task.totalBooklets) {
      task.currentFileIndex += 1;
      task.status = "active";

      await task.save();

      return res.status(200).json({
        success: true,
        message: "Booklet submitted. Moving to next booklet.",
        taskCompleted: false,
        nextFileIndex: task.currentFileIndex,
      });
    }

    // ✅ LAST BOOKLET COMPLETED
    if (task.currentFileIndex === task.totalBooklets) {
      task.status = "success";
      await task.save();

      return res.status(200).json({
        success: true,
        message: "All booklets completed. Task finished.",
        taskCompleted: true,
      });
    }

    // Check if all booklets are completed
    // if (task.totalBooklets === 0) {
    //   task.status = "success";
    //   await task.save();
    //   return res
    //     .status(200)
    //     .json({ message: "Task is completed", success: true });
    // } else {
    //   //passed to the next booklet and along with response that booklet annotations synced successfully
    //   return res.status(200).json({
    //     success: true,
    //     message: "Booklet submitted successfully",
    //     taskCompleted: false,
    //     currentAnswerPdfId: answerpdfid,
    //   });
    // }

    // return res.status(200).json({
    // success: true,
    // message: "Booklet annotations synced successfully",
    // totalSynced: bulkOps.length,
    // answerPdfId: answerpdfid,
    // });
  } catch (error) {
    console.error("❌ Error in completedBookletHandler:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const checkTaskCompletionHandler = async (req, res) => {
  const { id } = req.params;

  try {
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const tasks = await Task.find({ subjectCode: task.subjectCode });

    let totalBooklets = 0;
    let completedBooklets = 0;

    for (const currentTask of tasks) {
      const answerPdfs = await AnswerPdf.find({
        taskId: currentTask._id,
        status: "true",
      });
      totalBooklets += currentTask.totalBooklets;
      completedBooklets += answerPdfs.length;
    }

    const subjectFolderDetails = await SubjectFolderModel.findOne({
      folderName: task.subjectCode,
    });

    subjectFolderDetails.evaluated = completedBooklets;
    subjectFolderDetails.evaluation_pending = totalBooklets - completedBooklets;
    await subjectFolderDetails.save();

    const booklets = await AnswerPdf.find({ taskId: id, status: "false" });

    if (booklets.length === 0) {
      task.status = "success";
      await task.save();
      return res
        .status(200)
        .json({ message: "Task is completed", success: true });
    }

    return res
      .status(200)
      .json({ message: "Task is not completed", success: false });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch tasks", error: error.message });
  }
};

const rejectBooklet = async (req, res) => {
  const { answerPdfId } = req.params;
  const { reason, rejectedAt } = req.body;
  try {
    if (!isValidObjectId(answerPdfId)) {
      return res.status(400).json({ message: "Invalid answerPdfId." });
    }
    await AnswerPdf.findByIdAndUpdate(answerPdfId, {
      status: "reject",
      rejectionReason: reason,
      rejectedAt: rejectedAt ? new Date(rejectedAt) : new Date(),
    });
    return res.status(200).json({ message: "Booklet rejected successfully." });
  } catch (error) {
    console.error("Error rejecting booklet:", error);
    return res
      .status(500)
      .json({ message: "Failed to reject booklet", error: error.message });
  }
};

const reviewerRejectTask = async (req, res) => {
  try {
    const { questiondefinitionId, subjectCode, reviewerid, answerPdfId } =
      req.body;

    if (!questiondefinitionId || !subjectCode || !reviewerid || !answerPdfId) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: questiondefinitionId, subjectCode, reviewerid, answerPdfId",
      });
    }

    // 1️⃣ Update AnswerPdf status to reject
    const pdf = await AnswerPdf.findOneAndUpdate(
      {
        _id: answerPdfId,
        questiondefinitionId: questiondefinitionId,
      },
      {
        $set: {
          status: "reject",
          rejectedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!pdf) {
      return res.status(404).json({
        success: false,
        message: "Answer PDF not found",
      });
    }

    // 2️⃣ Update Task status to success
    await Task.findByIdAndUpdate(pdf.taskId, {
      $set: { status: "success" },
    });

    // 3️⃣ Optional: Update subject folder counts if needed
    await SubjectFolderModel.updateOne(
      { folderName: subjectCode },
      {
        $inc: {
          evaluation_pending: -1,
        },
      },
    );

    const marks = await Marks.findOne({
      answerPdfId,
      questiondefinitionId,
    }).select("allottedMarks");

    return res.status(200).json({
      success: true,
      message: "Booklet rejected and task marked as success",
      data: {
        answerPdfId,
        pdfName: pdf.answerPdfName,
        allottedMarks: marks?.allottedMarks || 0,
      },
    });
  } catch (error) {
    console.error("Error in reviewerRejectTask:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while rejecting task",
      error: error.message,
    });
  }
};

const getDataprincipalSide = async (req, res) => {
  try {
    const pdfDetails = await AnswerPdf.find({ status: "reject" })
      .select("answerPdfName taskId questiondefinitionId status assignedDate")
      .populate({
        path: "questiondefinitionId",
        select: "questionsName schemaId",
        populate: {
          path: "schemaId",
          select: "maxMarks",
        },
      })
      .lean();

    // Fetch allotted marks per PDF
    const result = await Promise.all(
      pdfDetails.map(async (pdf) => {
        const marks = await Marks.findOne({
          answerPdfId: pdf._id,
          questionDefinitionId: pdf.questiondefinitionId?._id,
        })
          .select("allottedMarks")
          .lean();

        return {
          answerPdfName: pdf.answerPdfName,
          questionName: pdf.questiondefinitionId?.questionsName || "",
          totalMarks: pdf.questiondefinitionId?.schemaId?.maxMarks || 0,
          allottedMarks: marks?.allottedMarks || 0,
          status: pdf.status,
        };
      }),
    );

    return res.status(200).json({
      status: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in reviewerRejectTask:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while rejecting task",
      error: error.message,
    });
  }
};

const assignReviewerRollbackTask = async (req, res) => {
  const { assignments } = req.body;

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ message: "No assignments provided" });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    let totalAssigned = 0;

    for (const item of assignments) {
      const {
        evaluatorId,
        reviewerId,
        subjectCode,
        questiondefinitionId,
        bookletsToAssign,
      } = item;

      if (
        !evaluatorId ||
        !reviewerId ||
        !subjectCode ||
        !questiondefinitionId ||
        !Array.isArray(bookletsToAssign) ||
        bookletsToAssign.length === 0
      ) {
        throw new Error("Missing or invalid required fields");
      }

      let reviewerTask = await ReviewerTask.findOne({
        evaluatorId,
        reviewerId,
        subjectCode,
        questiondefinitionId,
      }).session(session);

      if (!reviewerTask) {
        reviewerTask = new ReviewerTask({
          evaluatorId,
          reviewerId,
          subjectCode,
          questiondefinitionId,
          totalBooklets: 0,
          status: "inactive",
        });
      }

      const oldAnswerPdfs = await AnswerPdf.find({
        _id: { $in: bookletsToAssign },
        questiondefinitionId,
        status: { $in: ["true", "progress"] },
      }).session(session);

      if (oldAnswerPdfs.length !== bookletsToAssign.length) {
        const foundIds = oldAnswerPdfs.map((p) => p._id.toString());
        const invalidIds = bookletsToAssign.filter(
          (id) => !foundIds.includes(id),
        );

        throw new Error(
          `Invalid or ineligible AnswerPdf IDs: ${invalidIds.join(", ")}`,
        );
      }

      const alreadySent = await AnswerPdf.findOne({
        _id: { $in: bookletsToAssign },
        sentForReview: true,
      }).session(session);

      if (alreadySent) {
        throw new Error("One or more booklets already sent for review");
      }

      /* -------------------------------------------------------------------------- */
      /* 🔥 MARK OLD PDFs AS SENT FOR REVIEW + COMPLETE THEM */
      /* -------------------------------------------------------------------------- */
      await AnswerPdf.updateMany(
        { _id: { $in: bookletsToAssign } },
        {
          $set: {
            sentForReview: true,
            reviewerId,
            status: "true", // ✅ IMPORTANT FIX
          },
        },
        { session },
      );

      /* -------------------------------------------------------------------------- */
      /* 🔥 MARK OLD TASK AS SUCCESS IF NO ACTIVE PDFs REMAIN */
      /* -------------------------------------------------------------------------- */

      const oldTaskIds = [
        ...new Set(oldAnswerPdfs.map((pdf) => pdf.taskId.toString())),
      ];

      for (const taskId of oldTaskIds) {
        const remaining = await AnswerPdf.exists({
          taskId,
          status: { $in: ["false", "progress"] }, // ✅ only active ones
        }).session(session);

        if (!remaining) {
          await Task.findByIdAndUpdate(
            taskId,
            { $set: { status: "success" } },
            { session },
          );
        }
      }

      reviewerTask.totalBooklets += oldAnswerPdfs.length;
      await reviewerTask.save({ session });

      const newTask = new Task({
        subjectCode,
        userId: evaluatorId,
        questiondefinitionId,
        totalBooklets: oldAnswerPdfs.length,
        status: "inactive",
        currentFileIndex: 1,
        startTime: null,
        remainingTimeInSec: null,
        lastResumedAt: null,
        efficiency: [],
      });

      await newTask.save({ session });

      for (const oldPdf of oldAnswerPdfs) {
        const newAnswerPdf = new AnswerPdf({
          taskId: newTask._id,
          answerPdfName: oldPdf.answerPdfName,
          questiondefinitionId: oldPdf.questiondefinitionId,
          status: "false",
          assignedDate: new Date(),
        });

        await newAnswerPdf.save({ session });

        const oldImages = await AnswerPdfImage.find({
          answerPdfId: oldPdf._id,
          questiondefinitionId: oldPdf.questiondefinitionId,
        }).session(session);

        if (oldImages.length > 0) {
          const newImageDocs = oldImages.map((img) => ({
            answerPdfId: newAnswerPdf._id,
            questiondefinitionId: img.questiondefinitionId,
            name: img.name,
            page: img.page,
            status: "notVisited",
          }));

          await AnswerPdfImage.insertMany(newImageDocs, { session });
        }
      }

      totalAssigned += oldAnswerPdfs.length;
    }

    await session.commitTransaction();

    return res.status(201).json({
      message: "Reviewer rollback processed successfully",
      assignedCount: totalAssigned,
    });

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("❌ Reviewer rollback error:", err);

    return res.status(500).json({
      error: err.message,
    });

  } finally {
    session.endSession();
  }
};

const getReassignedbooklets = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("id", id);

    const objectId = new mongoose.Types.ObjectId(id);

    const reassignments = await BookletReassignment.find({
      toTaskId: objectId,
    })
      .sort({ reassignedAt: -1 })
      .lean();

    console.log("reassignments", reassignments);
    return res.status(200).json({
      data: reassignments,
    });
  } catch (error) {
    console.error("Error in fetching data:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while rejecting task",
      error: error.message,
    });
  }
};

const ChangeScannerTaskStatus = async (req, res) => {
  try {
    const { taskId, userId, folderName } = req.body;

    // Basic validation
    if (!taskId || !userId || !folderName) {
      return res.status(400).json({
        success: false,
        message: "taskId, userId and folderName are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId) || 
        !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid taskId or userId",
      });
    }

    // Find and update using ALL conditions
    const updatedTask = await ScannerTask.findOneAndUpdate(
      {
        _id: taskId,
        userId: userId,
        folderName: folderName,
      },
      { $set: { status: "success" } },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        message: "Scanner task not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Scanner task status updated to success",
      data: updatedTask,
    });

  } catch (error) {
    console.error("Error updating scanner task status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update scanner task status",
      error: error.message,
    });
  }
};

export {
  assigningTask,
  reassignPendingBooklets,
  reassignBooklets,
  getUserCurrentTaskStatus,
  removeAssignedTask,
  getAssignTaskById,
  getAllAssignedTaskByUserId,
  getUsersFormanualAssign,
  getAllTaskHandler,
  updateCurrentIndex,
  getQuestionDefinitionTaskId,
  getAllTasksBasedOnSubjectCode,
  completedBookletHandler,
  checkTaskCompletionHandler,
  editTaskHandler,
  autoAssigning,
  rejectBooklet,
  getReviewerTask,
  getReviewerBookletTask,
  reviewerRejectTask,
  getDataprincipalSide,
  assignReviewerRollbackTask,
  getReassignedbooklets,
  createScannerTask,
  getAllScannerTasks,
  assignBookletWiseTask,
  getBookletTaskById,
  getBookletTasksByUser,
  startBookletTask,
  completeBookletWise,
  rejectBookletWise,
  ChangeScannerTaskStatus,
};
