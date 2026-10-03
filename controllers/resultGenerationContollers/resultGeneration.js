import fs from "fs";
import path from "path";
// import PDFDocument from "pdfkit";
import archiver from "archiver";
import csvToJson from "../../services/csvToJson.js";
import convertJSONToCSV from "../../services/jsonToCsv.js";
import Marks from "../../models/EvaluationModels/marksModel.js";
import Task from "../../models/taskModels/taskModel.js";
import User from "../../models/authModels/User.js";
import AnswerPdf from "../../models/EvaluationModels/studentAnswerPdf.js";
import QuestionDefinition from "../../models/schemeModel/questionDefinitionSchema.js";
import { __dirname } from "../../server.js";
import { isValidObjectId } from "../../services/mongoIdValidation.js";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createCanvas, loadImage } from "canvas";
import pLimit from "p-limit";

// const generateResult = async (req, res) => {
//   const { subjectcode } = req.body;
//   const uploadedCsv = req.file;

//   try {
//     if (!subjectcode) {
//       return res.status(400).json({ message: "Subject code is required." });
//     }

//     if (!uploadedCsv) {
//       return res.status(400).json({ message: "No CSV file uploaded." });
//     }

//     // Create necessary folders
//     const resultFolder = path.join(__dirname, "resultFolder", subjectcode);
//     const tempFolder = path.join(__dirname, "temp");
//     if (!fs.existsSync(tempFolder))
//       fs.mkdirSync(tempFolder, { recursive: true });
//     if (!fs.existsSync(resultFolder))
//       fs.mkdirSync(resultFolder, { recursive: true });

//     // Save uploaded CSV temporarily
//     const tempCsvPath = path.join(tempFolder, uploadedCsv.originalname);
//     fs.writeFileSync(tempCsvPath, fs.readFileSync(uploadedCsv.path));

//     // Convert uploaded CSV to JSON
//     const csvData = await csvToJson(tempCsvPath);

//     // Fetch tasks and generate results
//     const tasks = await Task.find({ subjectCode: subjectcode }).populate(
//       "userId",
//       "email"
//     );
//     console.log("tasks", tasks);

//     if (tasks.length === 0) {
//       return res.status(404).json({ message: "No tasks found." });
//     }

//     // Map taskId to user email
//     const userMap = tasks.reduce((map, task) => {
//       if (task.userId && task.userId.email) {
//         map[task._id] = task.userId.email;
//       }
//       return map;
//     }, {});

//     const taskIds = tasks.map((task) => task._id);
//     const completedBooklets = await AnswerPdf.find({
//       taskId: { $in: taskIds },
//       status: true,
//     });
//     console.log("Completed Booklets:", completedBooklets.length);

//     if (completedBooklets.length === 0) {
//       return res.status(404).json({ message: "No completed booklets found." });
//     }

//     const generatingResults = await Promise.all(
//       completedBooklets.map(async (booklet) => {
//         const barcode = booklet.answerPdfName?.split("_")[0];
//         if (!barcode) {
//           return {
//             status: "false",
//             message: "Barcode name not found",
//             bookletName: booklet.answerPdfName,
//             barcode: "",
//           };
//         }

//         const marks = await Marks.find({ answerPdfId: booklet._id });
//         console.log(`Marks for booklet ${booklet.answerPdfName}:`, marks);

//         const totalMarks = marks.reduce(
//           (sum, mark) => sum + mark.allottedMarks,
//           0
//         );
//         console.log(
//           `Total marks for booklet ${booklet.answerPdfName}:`,
//           totalMarks
//         );

//         // Get evaluator's email from the userMap
//         const evaluatedBy = userMap[booklet.taskId] || "Unknown";

//         console.log("totalMarks", totalMarks, "evaluatedBy", evaluatedBy);

//         return {
//           status: "true",
//           barcode: barcode,
//           totalMarks: totalMarks,
//           evaluatedBy: evaluatedBy,
//         };
//       })
//     );

//     // Match barcodes from the CSV with generatingResults
//     const finalResults = csvData.map((row) => {
//       console.log("🔍 Checking row:", row.BARCODE);

//       const matchingResult = generatingResults.find((result) => {
//         console.log("  comparing ->", result.barcode, "with", row.BARCODE);
//         return result.barcode == row.BARCODE;
//       });
//       // console.log("barcode:", barcode, "rowBarcode:", BARCODE);

//       if (matchingResult) {
//         console.log(
//           "matchingResult:",
//           matchingResult,
//           "marks:",
//           matchingResult.totalMarks
//         );
//         return {
//           ...row,
//           MARKS: matchingResult.totalMarks,
//           EVALUATEDBY: matchingResult.evaluatedBy,
//         };
//       }
//       return {
//         ...row,
//         MARKS: "N/A",
//         EVALUATEDBY: "N/A",
//       };
//     });

//     // Convert final results to CSV
//     const newCsvData = convertJSONToCSV(finalResults);
//     if (!newCsvData) {
//       return res.status(500).json({ message: "Failed to generate CSV." });
//     }

//     const resultCsvPath = path.join(resultFolder, "result.csv");
//     fs.writeFileSync(resultCsvPath, newCsvData);

//     // Clean up temp folder
//     fs.rmSync(tempFolder, { recursive: true, force: true });

//     // Send JSON response to the frontend
//     return res.status(200).json({
//       message: "Results generated successfully.",
//       data: finalResults,
//       csvSavedPath: resultCsvPath,
//     });
//   } catch (error) {
//     console.error("Error generating results:", error);
//     return res
//       .status(500)
//       .json({ message: "Failed to generate result", error: error.message });
//   }
// };

import Schema from "../../models/schemeModel/schema.js";
import Subject from "../../models/classModel/subjectModel.js";
import CourseSchemaRelation from "../../models/subjectSchemaRelationModel/subjectSchemaRelationModel.js";
import BookletTask from "../../models/taskModels/bookletTaskModel.js";
import BookletMarks from "../../models/EvaluationModels/bookletMarksModel.js";
import BookletAnswerPdf from "../../models/EvaluationModels/bookletAnswerPdfModel.js";

const generateResult = async (req, res) => {
  const { subjectcode } = req.body;
  const uploadedCsv = req.file;

  console.log("--------------------------------------------------");
  console.log("🚀 RESULT GENERATION STARTED");
  console.log("📘 Subject Code:", subjectcode);
  console.log("--------------------------------------------------");

  try {
    /* ============================================================ */
    /* 1. VALIDATION                                                */
    /* ============================================================ */

    if (!subjectcode) {
      return res.status(400).json({
        message: "Subject code is required.",
      });
    }

    if (!uploadedCsv) {
      return res.status(400).json({
        message: "No CSV file uploaded.",
      });
    }

    /* ============================================================ */
    /* 2. CREATE REQUIRED FOLDERS                                   */
    /* ============================================================ */

    const resultFolder = path.join(__dirname, "resultFolder", subjectcode);

    const tempFolder = path.join(__dirname, "temp");

    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder, { recursive: true });
    }

    if (!fs.existsSync(resultFolder)) {
      fs.mkdirSync(resultFolder, { recursive: true });
    }

    /* ============================================================ */
    /* 3. SAVE UPLOADED CSV TEMPORARILY                             */
    /* ============================================================ */

    const tempCsvPath = path.join(tempFolder, uploadedCsv.originalname);

    fs.writeFileSync(tempCsvPath, fs.readFileSync(uploadedCsv.path));

    /* ============================================================ */
    /* 4. READ UPLOADED CSV                                         */
    /* ============================================================ */

    const csvData = await csvToJson(tempCsvPath);

    console.log("📄 Uploaded CSV rows:", csvData.length);

    if (!csvData.length) {
      fs.rmSync(tempFolder, {
        recursive: true,
        force: true,
      });

      return res.status(400).json({
        message: "Uploaded CSV is empty.",
      });
    }

    /* ============================================================ */
    /* 5. GET SUBJECT                                               */
    /* ============================================================ */

    const subject = await Subject.findOne({
      code: subjectcode,
    });

    if (!subject) {
      fs.rmSync(tempFolder, {
        recursive: true,
        force: true,
      });

      return res.status(404).json({
        message: "Subject not found.",
      });
    }

    /* ============================================================ */
    /* 6. GET SUBJECT → SCHEMA RELATION                             */
    /* ============================================================ */

    const relation = await CourseSchemaRelation.findOne({
      subjectId: subject._id,
    });

    if (!relation) {
      fs.rmSync(tempFolder, {
        recursive: true,
        force: true,
      });

      return res.status(404).json({
        message: "Schema relation not found.",
      });
    }

    /* ============================================================ */
    /* 7. GET SCHEMA                                                */
    /* ============================================================ */

    const schema = await Schema.findById(relation.schemaId);

    if (!schema) {
      fs.rmSync(tempFolder, {
        recursive: true,
        force: true,
      });

      return res.status(404).json({
        message: "Schema not found.",
      });
    }

    console.log("📊 Schema Type:", schema.schemaType);
    console.log("📊 Total Questions:", schema.totalQuestions);
    console.log("📊 Minimum Marks:", schema.minMarks);
    console.log("📊 Grace Marks:", schema.graceMarks);

    /* ============================================================ */
    /* 8. RESULT IS BOOKLET-WISE                                    */
    /* ============================================================ */

    /*
     * The result generation API should now generate the
     * booklet-wise result directly.
     *
     * We are intentionally NOT using:
     *
     * generateQuestionWiseResult()
     * generateBookletWiseResult()
     *
     * because the new CSV format is different from the
     * existing implementation.
     */

    /* ============================================================ */
    /* 9. GET BOOKLET TASKS                                         */
    /* ============================================================ */

    const bookletTasks = await BookletTask.find({
      subjectCode: subjectcode,
    });

    if (!bookletTasks.length) {
      fs.rmSync(tempFolder, {
        recursive: true,
        force: true,
      });

      return res.status(404).json({
        message: "No booklet tasks found for this subject.",
      });
    }

    console.log("📚 Booklet Tasks Found:", bookletTasks.length);

    /* ============================================================ */
    /* 10. GET COMPLETED BOOKLETS                                   */
    /* ============================================================ */

    const taskIds = bookletTasks.map((task) => task._id);

    const booklets = await BookletAnswerPdf.find({
      bookletTaskId: {
        $in: taskIds,
      },
      status: "true",
    });

    if (!booklets.length) {
      fs.rmSync(tempFolder, {
        recursive: true,
        force: true,
      });

      return res.status(404).json({
        message: "No evaluated booklets found.",
      });
    }

    console.log("📘 Evaluated Booklets Found:", booklets.length);

    /* ============================================================ */
    /* 11. CREATE TASK MAP                                         */
    /* ============================================================ */

    const taskMap = {};

    for (const task of bookletTasks) {
      taskMap[task._id.toString()] = task;
    }

    /* ============================================================ */
    /* 12. CREATE RESULT MAP BY BARCODE                             */
    /* ============================================================ */

    const resultMap = {};

    /* ============================================================ */
    /* 13. PROCESS EVERY BOOKLET                                    */
    /* ============================================================ */

    for (const booklet of booklets) {
      try {
        /* -------------------------------------------------------- */
        /* GET BOOKLET TASK                                         */
        /* -------------------------------------------------------- */

        const task = taskMap[booklet.bookletTaskId.toString()];

        if (!task) {
          console.log(`⚠ Task not found for booklet ${booklet.answerPdfName}`);

          continue;
        }

        /* -------------------------------------------------------- */
        /* GET USER ID                                               */
        /* -------------------------------------------------------- */

        const userId = task.userId;

        if (!userId) {
          console.log(
            `⚠ userId not found for booklet ${booklet.answerPdfName}`,
          );

          continue;
        }

        /* -------------------------------------------------------- */
        /* GET BARCODE                                               */
        /* -------------------------------------------------------- */

        let barcode = String(booklet.answerPdfName || "")
          .replace(/\.pdf$/i, "")
          .trim();

        if (!barcode) {
          console.log(`⚠ Barcode not found for booklet ${booklet._id}`);

          continue;
        }

        console.log(`\n🔍 Processing booklet: ${barcode}`);

        console.log(`   answerPdfId: ${booklet._id}`);

        console.log(`   userId: ${userId}`);

        /* -------------------------------------------------------- */
        /* MARKS DATA PATH                                           */
        /* -------------------------------------------------------- */

        const marksDataPath = path.join(
          "BookletAnnotations",
          String(userId),
          String(booklet._id),
          "marksData.json",
        );

        console.log(`   📂 marksData path: ${marksDataPath}`);

        /* -------------------------------------------------------- */
        /* CHECK marksData.json                                     */
        /* -------------------------------------------------------- */

        if (!fs.existsSync(marksDataPath)) {
          console.log(`⚠ marksData.json not found for booklet ${barcode}`);

          continue;
        }

        /* -------------------------------------------------------- */
        /* READ marksData.json                                      */
        /* -------------------------------------------------------- */

        let marksJson;

        try {
          marksJson = JSON.parse(fs.readFileSync(marksDataPath, "utf8"));
        } catch (jsonError) {
          console.error(
            `❌ Invalid marksData.json for ${barcode}:`,
            jsonError.message,
          );

          continue;
        }

        const marksArray = Array.isArray(marksJson?.marks)
          ? marksJson.marks
          : [];

        /* -------------------------------------------------------- */
        /* CREATE QUESTION MARKS MAP                                */
        /* -------------------------------------------------------- */

        const questionWiseMarks = {};

        /*
         * Initialize every question with 0.
         *
         * Example:
         *
         * Q1 = 0
         * Q2 = 0
         * Q3 = 0
         * ...
         */

        for (
          let questionNumber = 1;
          questionNumber <= schema.totalQuestions;
          questionNumber++
        ) {
          questionWiseMarks[`Q${questionNumber}`] = 0;
        }

        /* -------------------------------------------------------- */
        /* READ MARKS                                                */
        /* -------------------------------------------------------- */

        for (const mark of marksArray) {
          if (!mark) {
            continue;
          }

          const questionName = String(mark.questionsName ?? "").trim();

          if (!questionName) {
            continue;
          }

          const allottedMarks = Number(mark.allottedMarks) || 0;

          /*
           * Normal question:
           *
           * questionsName = "1"
           * becomes
           * Q1
           */

          const questionKey = `Q${questionName}`;

          /*
           * If the question exists in the configured schema,
           * store its marks.
           *
           * This also supports values such as:
           *
           * questionsName = "1"
           * questionsName = "2"
           * ...
           */

          if (
            Object.prototype.hasOwnProperty.call(questionWiseMarks, questionKey)
          ) {
            questionWiseMarks[questionKey] = allottedMarks;
          }
        }

        /* -------------------------------------------------------- */
        /* CALCULATE TOTAL MARKS                                    */
        /* -------------------------------------------------------- */

        let totalMarks = 0;

        for (
          let questionNumber = 1;
          questionNumber <= schema.totalQuestions;
          questionNumber++
        ) {
          totalMarks += Number(questionWiseMarks[`Q${questionNumber}`]) || 0;
        }

        console.log(`   📝 Total Marks Before Grace: ${totalMarks}`);

        /* ======================================================== */
        /* GRACE MARK CALCULATION                                   */
        /* ======================================================== */

        const minimumMarks = Number(schema.minMarks) || 0;

        const configuredGraceMarks = Number(schema.graceMarks) || 0;

        let graceMarks = 0;

        /*
         * Grace is given ONLY when:
         *
         * 1. Student is below minimum marks
         *
         * AND
         *
         * 2. Adding the FULL configured grace marks
         *    makes the student reach or exceed minimum marks.
         *
         * Example:
         *
         * Minimum = 40
         * Grace = 5
         * Student = 36
         *
         * 36 + 5 = 41
         *
         * Therefore:
         * Grace = 5
         * Total = 41
         *
         *
         * Example:
         *
         * Minimum = 40
         * Grace = 5
         * Student = 34
         *
         * 34 + 5 = 39
         *
         * Still below minimum.
         *
         * Therefore:
         * Grace = 0
         * Total = 34
         */

        if (totalMarks < minimumMarks) {
          if (totalMarks + configuredGraceMarks >= minimumMarks) {
            graceMarks = configuredGraceMarks;
          }
        }

        const finalTotalMarks = totalMarks + graceMarks;

        console.log(`   🎯 Minimum Marks: ${minimumMarks}`);

        console.log(`   🎁 Configured Grace Marks: ${configuredGraceMarks}`);

        console.log(`   🎁 Grace Marks Applied: ${graceMarks}`);

        console.log(`   ✅ Final Total Marks: ${finalTotalMarks}`);

        /* -------------------------------------------------------- */
        /* STORE RESULT BY BARCODE                                  */
        /* -------------------------------------------------------- */

        resultMap[barcode] = {
          BARCODE: barcode,
          ...questionWiseMarks,
          Grace_marks: graceMarks,
          Total_Marks: finalTotalMarks,
        };
      } catch (bookletError) {
        console.error(
          `❌ Error processing booklet ${booklet.answerPdfName}:`,
          bookletError.message,
        );
      }
    }

    /* ============================================================ */
    /* 14. GENERATE FINAL CSV                                      */
    /* ============================================================ */

    const finalResults = [];

    for (const row of csvData) {
      const barcode = String(row.BARCODE ?? "").trim();

      const matchingResult = resultMap[barcode];

      /* -------------------------------------------------------- */
      /* CREATE BASIC STUDENT DATA                                */
      /* -------------------------------------------------------- */

      const resultRow = {
        SNO: row.SN ?? "",
        Barcode: barcode,
        Roll_No: row.ROLL_NO ?? "",
        Course_code: row.COURSE_CODE ?? subjectcode,
      };

      /* -------------------------------------------------------- */
      /* ADD QUESTION MARKS                                      */
      /* -------------------------------------------------------- */

      for (
        let questionNumber = 1;
        questionNumber <= schema.totalQuestions;
        questionNumber++
      ) {
        const questionKey = `Q${questionNumber}`;

        resultRow[questionKey] = matchingResult?.[questionKey] ?? 0;
      }

      /* -------------------------------------------------------- */
      /* ADD GRACE + TOTAL                                       */
      /* -------------------------------------------------------- */

      resultRow.Grace_marks = matchingResult?.Grace_marks ?? 0;

      resultRow.Total_Marks = matchingResult?.Total_Marks ?? 0;

      finalResults.push(resultRow);
    }

    /* ============================================================ */
    /* 15. DEFINE EXACT CSV COLUMN ORDER                           */
    /* ============================================================ */

    const headers = ["SNO", "Barcode", "Roll_No", "Course_code"];

    for (
      let questionNumber = 1;
      questionNumber <= schema.totalQuestions;
      questionNumber++
    ) {
      headers.push(`Q${questionNumber}`);
    }

    headers.push("Grace_marks", "Total_Marks");

    /* ============================================================ */
    /* 16. CONVERT TO CSV                                          */
    /* ============================================================ */

    /*
     * Do not depend on object insertion order.
     *
     * Build the CSV manually using the exact headers so
     * the generated CSV always has the required structure.
     */

    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) {
        return "";
      }

      const stringValue = String(value);

      if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    };

    const csvLines = [];

    /* HEADER */

    csvLines.push(headers.map(escapeCsvValue).join(","));

    /* DATA */

    for (const resultRow of finalResults) {
      csvLines.push(
        headers.map((header) => escapeCsvValue(resultRow[header])).join(","),
      );
    }

    const csvOutput = csvLines.join("\n");

    /* ============================================================ */
    /* 17. SAVE RESULT CSV                                        */
    /* ============================================================ */

    const resultCsvPath = path.join(resultFolder, "result.csv");

    fs.writeFileSync(resultCsvPath, csvOutput, "utf8");

    console.log("\n--------------------------------------------------");

    console.log("🎉 RESULT CSV GENERATED SUCCESSFULLY");

    console.log("📁 Result Path:", resultCsvPath);

    console.log("📊 Students:", finalResults.length);

    console.log("📊 Questions:", schema.totalQuestions);

    console.log("--------------------------------------------------");

    /* ============================================================ */
    /* 18. CLEAN TEMP FOLDER                                      */
    /* ============================================================ */

    fs.rmSync(tempFolder, {
      recursive: true,
      force: true,
    });

    /* ============================================================ */
    /* 19. RESPONSE                                                */
    /* ============================================================ */

    return res.status(200).json({
      message: "Booklet-wise results generated successfully.",

      data: finalResults,

      csvSavedPath: resultCsvPath,

      schemaType: schema.schemaType,

      totalQuestions: schema.totalQuestions,

      minimumMarks: schema.minMarks,

      configuredGraceMarks: schema.graceMarks,
    });
  } catch (error) {
    console.error("❌ ERROR IN RESULT GENERATION:", error);

    /* ---------------------------------------------------------- */
    /* CLEAN TEMP FOLDER EVEN ON ERROR                             */
    /* ---------------------------------------------------------- */

    try {
      const tempFolder = path.join(__dirname, "temp");

      if (fs.existsSync(tempFolder)) {
        fs.rmSync(tempFolder, {
          recursive: true,
          force: true,
        });
      }
    } catch (cleanupError) {
      console.error("⚠ Failed to clean temp folder:", cleanupError.message);
    }

    return res.status(500).json({
      message: "Failed to generate result",
      error: error.message,
    });
  }
};

async function generateQuestionWiseResult({
  subjectcode,
  csvData,
  schema,
  resultFolder,
  tempFolder,
  res,
}) {
  const totalQuestions = schema.totalQuestions;

  /* ------------------------------------------------------------ */
  /* 1️⃣ FETCH TASKS                                              */
  /* ------------------------------------------------------------ */

  const tasks = await Task.find({ subjectCode: subjectcode });

  if (tasks.length === 0) {
    return res.status(404).json({ message: "No tasks found." });
  }

  const uniqueQuestions = new Set(
    tasks.map((t) => t.questiondefinitionId.toString()),
  );
  // console.log('uniqueQuestions',uniqueQuestions)

  if (uniqueQuestions.size !== totalQuestions) {
    return res.status(400).json({
      message: "All questions are not assigned yet.",
    });
  }

  /* ------------------------------------------------------------ */
  /* 3️⃣ FETCH USERS (IMPORTANT OPTIMIZATION)                     */
  /* ------------------------------------------------------------ */

  const allUsers = await User.find().select("_id email");

  const userMap = {};
  allUsers.forEach((u) => {
    userMap[u._id.toString()] = u.email;
  });

  /* ------------------------------------------------------------ */
  /* 4️⃣ FETCH ANSWER PDFs                                        */
  /* ------------------------------------------------------------ */

  const taskIds = tasks.map((t) => t._id);

  const allAnswerPdfs = await AnswerPdf.find({
    taskId: { $in: taskIds },
  });

  if (!allAnswerPdfs.length) {
    return res.status(404).json({ message: "No booklets found." });
  }

  const allAnswerPdfIds = allAnswerPdfs.map((pdf) => pdf._id);

  /* ------------------------------------------------------------ */
  /* 5️⃣ FETCH MARKS                                              */
  /* ------------------------------------------------------------ */

  const allMarks = await Marks.find({
    answerPdfId: { $in: allAnswerPdfIds },
  }).populate("questionDefinitionId", "questionsName");

  /* ------------------------------------------------------------ */
  /* 6️⃣ FILTER TASKS (ONLY USED ONES)                            */
  /* ------------------------------------------------------------ */

  const usedTaskIds = allAnswerPdfs.map((item) => item.taskId.toString());

  const filteredTasks = tasks.filter((task) =>
    usedTaskIds.includes(task._id.toString()),
  );

  /* ------------------------------------------------------------ */
  /* 7️⃣ BUILD BOOKLET MAP                                        */
  /* ------------------------------------------------------------ */

  const bookletMap = {};

  for (const pdf of allAnswerPdfs) {
    const barcode = pdf.answerPdfName.replace(".pdf", "");

    if (!bookletMap[barcode]) bookletMap[barcode] = {};

    bookletMap[barcode][pdf.taskId.toString()] = pdf;
  }

  /* ------------------------------------------------------------ */
  /* 8️⃣ FIND VALID (FULLY EVALUATED) BOOKLETS                    */
  /* ------------------------------------------------------------ */

  const validBarcodes = [];

  for (const barcode in bookletMap) {
    const taskWiseMap = bookletMap[barcode];

    let isComplete = true;

    for (const task of filteredTasks) {
      const pdf = taskWiseMap[task._id.toString()];

      if (!pdf) continue;

      if (String(pdf.status) !== "true") {
        isComplete = false;
        break;
      }

      const marksExist = allMarks.some(
        (m) =>
          m.answerPdfId.toString() === pdf._id.toString() &&
          m.questionDefinitionId._id.toString() ===
            task.questiondefinitionId.toString(),
      );

      if (!marksExist) {
        isComplete = false;
        break;
      }
    }

    if (isComplete) validBarcodes.push(barcode);
  }
  console.log("Valid Barcodes:", validBarcodes);
  /* ------------------------------------------------------------ */
  /* 9️⃣ GENERATE RESULTS                                         */
  /* ------------------------------------------------------------ */

  const generatingResults = validBarcodes.map((barcode) => {
    let totalMarks = 0;
    let questionWiseMarks = {};
    let evaluatedBySet = new Set();

    const taskWiseMap = bookletMap[barcode];

    for (const task of filteredTasks) {
      const pdf = taskWiseMap[task._id.toString()];
      if (!pdf) continue;

      const marks = allMarks.filter(
        (m) => m.answerPdfId.toString() === pdf._id.toString(),
      );

      /* -------- MARKS CALCULATION -------- */

      for (const mark of marks) {
        const qName = mark.questionDefinitionId?.questionsName || "Unknown";

        questionWiseMarks[`Q${qName}`] =
          (questionWiseMarks[`Q${qName}`] || 0) + mark.allottedMarks;

        totalMarks += mark.allottedMarks;
      }

      /* -------- ✅ FIXED EVALUATOR LOGIC -------- */

      // let evaluatorEmail = null;

      // // 🔥 Priority: evaluatorId (actual evaluator)
      // if (task.evaluatorId) {
      //   evaluatorEmail = userMap[task.evaluatorId.toString()];
      // }

      // // fallback: userId
      // else if (task.userId) {
      //   evaluatorEmail = userMap[task.userId.toString()];
      // }

      // if (evaluatorEmail) {
      //   evaluatedBySet.add(evaluatorEmail);
      // }

      let emailsSet = new Set();

      if (task.evaluatorId) {
        const evaluatorEmail = userMap[task.evaluatorId.toString()];
        if (evaluatorEmail) emailsSet.add(evaluatorEmail);
      }

      if (task.userId) {
        const headEmail = userMap[task.userId.toString()];
        if (headEmail && !emailsSet.has(headEmail)) {
          emailsSet.add(headEmail);
        }
      }

      emailsSet.forEach((email) => evaluatedBySet.add(email));
    }

    return {
      BARCODE: barcode,
      ...questionWiseMarks,
      MARKS: totalMarks,
      EVALUATEDBY: Array.from(evaluatedBySet).join(", "),
    };
  });

  /* ------------------------------------------------------------ */
  /* 🔟 MERGE WITH CSV                                            */
  /* ------------------------------------------------------------ */

  const finalResults = csvData.map((row) => {
    const match = generatingResults.find(
      (r) => String(r.BARCODE).trim() === String(row.BARCODE).trim(),
    );

    if (match) {
      const { BARCODE, ...resultData } = match;

      return {
        ...row,
        ...resultData,
      };
    }

    return {
      ...row,
      RESULT: "Not Fully Evaluated",
    };
  });

  /* ------------------------------------------------------------ */
  /* 1️⃣1️⃣ SAVE CSV                                               */
  /* ------------------------------------------------------------ */

  const newCsvData = convertJSONToCSV(finalResults);

  const resultCsvPath = path.join(resultFolder, "result.csv");

  fs.writeFileSync(resultCsvPath, newCsvData);

  fs.rmSync(tempFolder, { recursive: true, force: true });

  /* ------------------------------------------------------------ */
  /* ✅ RESPONSE                                                   */
  /* ------------------------------------------------------------ */

  return res.status(200).json({
    message: "Question-wise results generated successfully.",
    data: finalResults,
    csvSavedPath: resultCsvPath,
  });
}

async function generateBookletWiseResult({
  subjectcode,
  csvData,
  resultFolder,
  tempFolder,
  res,
}) {
  try {
    /* -------------------------------------------- */
    /* 1️⃣ GET ALL BOOKLET TASKS                    */
    /* -------------------------------------------- */

    const bookletTasks = await BookletTask.find({
      subjectCode: subjectcode,
    });

    if (!bookletTasks.length) {
      return res.status(404).json({
        message: "No booklet tasks found",
      });
    }

    /* -------------------------------------------- */
    /* 2️⃣ GET ALL USERS                            */
    /* -------------------------------------------- */

    const userIds = [
      ...new Set(bookletTasks.map((t) => t.userId?.toString()).filter(Boolean)),
    ];

    const users = await User.find({
      _id: { $in: userIds },
    }).select("_id email");

    const userEmailMap = {};

    users.forEach((u) => {
      userEmailMap[u._id.toString()] = u.email;
    });

    /* -------------------------------------------- */
    /* 3️⃣ GET ALL ANSWER PDFS                      */
    /* -------------------------------------------- */

    const taskIds = bookletTasks.map((t) => t._id);

    const answerPdfs = await BookletAnswerPdf.find({
      bookletTaskId: { $in: taskIds },
    });

    if (!answerPdfs.length) {
      return res.status(404).json({
        message: "No booklet answer pdfs found",
      });
    }

    /* -------------------------------------------- */
    /* 4️⃣ CREATE RESULT MAP                        */
    /* -------------------------------------------- */

    const bookletMap = {};

    for (const pdf of answerPdfs) {
      const barcode = pdf.answerPdfName.replace(".pdf", "");

      if (!bookletMap[barcode]) {
        bookletMap[barcode] = {};
      }

      const answerPdfId = pdf._id.toString();

      /* -------------------------------------------- */
      /* LOOP ALL USERS                               */
      /* -------------------------------------------- */

      for (const userId of userIds) {
        const userEmail = userEmailMap[userId] || "Unknown";

        const annotationFolderPath = path.join(
          "BookletAnnotations",
          userId,
          answerPdfId,
        );

        /* -------------------------------------------- */
        /* CHECK FOLDER EXISTS                          */
        /* -------------------------------------------- */

        if (!fs.existsSync(annotationFolderPath)) {
          continue;
        }

        /* -------------------------------------------- */
        /* CHECK marks.json EXISTS                      */
        /* -------------------------------------------- */

        const marksFilePath = path.join(annotationFolderPath, "marks.json");

        if (!fs.existsSync(marksFilePath)) {
          continue;
        }

        /* -------------------------------------------- */
        /* READ marks.json                              */
        /* -------------------------------------------- */

        const marksJson = JSON.parse(fs.readFileSync(marksFilePath, "utf8"));

        const marksArray = marksJson.marks || [];

        if (!marksArray.length) {
          continue;
        }

        /* -------------------------------------------- */
        /* CREATE USER OBJECT                           */
        /* -------------------------------------------- */

        if (!bookletMap[barcode][userEmail]) {
          bookletMap[barcode][userEmail] = {
            TOTAL: 0,
          };
        }

        /* -------------------------------------------- */
        /* RESET TOTAL BEFORE RECALCULATING             */
        /* -------------------------------------------- */

        bookletMap[barcode][userEmail].TOTAL = 0;

        /* -------------------------------------------- */
        /* STORE QUESTION MARKS                         */
        /* -------------------------------------------- */

        for (const markEntry of marksArray) {
          const qKey = `Q${markEntry.question}`;

          const allottedMarks = Number(markEntry.allottedMarks || 0);

          /*
            STORE QUESTION MARKS
          */

          bookletMap[barcode][userEmail][qKey] = allottedMarks;

          /*
            CALCULATE TOTAL
          */

          bookletMap[barcode][userEmail].TOTAL += allottedMarks;
        }
      }
    }

    console.log("📘 FINAL BOOKLET MAP:", JSON.stringify(bookletMap, null, 2));

    /* -------------------------------------------- */
    /* 5️⃣ CONVERT TO CSV STRUCTURE                 */
    /* -------------------------------------------- */

    const results = [];

    for (const barcode in bookletMap) {
      const row = {
        BARCODE: barcode,
      };

      const evaluators = bookletMap[barcode];

      for (const evaluatorEmail in evaluators) {
        const evalData = evaluators[evaluatorEmail];

        /*
          ADD TOTAL FIRST
        */

        row[`TOTAL_${evaluatorEmail}`] = evalData.TOTAL || 0;

        /*
          ADD QUESTION MARKS
        */

        for (const key in evalData) {
          if (key === "TOTAL") continue;

          row[`${key}_${evaluatorEmail}`] = evalData[key];
        }
      }

      results.push(row);
    }

    console.log("📊 FINAL GENERATED RESULTS:", results);

    /* -------------------------------------------- */
    /* 6️⃣ MERGE WITH CSV                           */
    /* -------------------------------------------- */

    const finalResults = csvData.map((row) => {
      const match = results.find(
        (r) => String(r.BARCODE).trim() === String(row.BARCODE).trim(),
      );

      if (match) {
        const { BARCODE, ...data } = match;

        return {
          ...row,
          RESULT: "Evaluated",
          ...data,
        };
      }

      return {
        ...row,
        RESULT: "Not Evaluated",
      };
    });

    /* -------------------------------------------- */
    /* 7️⃣ GENERATE CSV                             */
    /* -------------------------------------------- */

    const csvOutput = convertJSONToCSV(finalResults);

    const resultCsvPath = path.join(resultFolder, "result.csv");

    fs.writeFileSync(resultCsvPath, csvOutput);

    /* -------------------------------------------- */
    /* 8️⃣ CLEAN TEMP                               */
    /* -------------------------------------------- */

    fs.rmSync(tempFolder, {
      recursive: true,
      force: true,
    });

    /* -------------------------------------------- */
    /* 9️⃣ RESPONSE                                 */
    /* -------------------------------------------- */

    return res.status(200).json({
      message: "Booklet-wise multi evaluator result generated successfully.",
      csvSavedPath: resultCsvPath,
      data: finalResults,
    });
  } catch (error) {
    console.error("❌ ERROR IN RESULT GENERATION:", error);

    return res.status(500).json({
      message: "Failed to generate booklet-wise result",
      error: error.message,
    });
  }
}

const getPreviousResult = async (req, res) => {
  const { subjectcode } = req.query;

  try {
    if (!subjectcode) {
      return res.status(400).json({ message: "Subject code is required." });
    }

    const resultFolderPath = path.join(__dirname, "resultFolder", subjectcode);

    if (!fs.existsSync(resultFolderPath)) {
      return res
        .status(404)
        .json({ message: "No results found for this subject code." });
    }

    const files = fs.readdirSync(resultFolderPath);
    if (files.length === 0) {
      return res
        .status(404)
        .json({ message: "No results found for this subject code....." });
    }

    const results = files.map((filename) => {
      const filePath = path.join(resultFolderPath, filename);
      const stats = fs.statSync(filePath);

      return {
        filename: filename,
        time: stats.mtime.toISOString(),
      };
    });

    return res.status(200).json({ results });
  } catch (error) {
    console.error("Error retrieving previous results:", error);
    return res
      .status(500)
      .json({ message: "Failed to retrieve results", error: error.message });
  }
};

const downloadResultByName = async (req, res) => {
  const { subjectcode, filename } = req.query;

  try {
    if (!subjectcode || !filename) {
      return res
        .status(400)
        .json({ message: "Subject code and filename are required." });
    }

    const resultFolderPath = path.join(__dirname, "resultFolder", subjectcode);

    if (!fs.existsSync(resultFolderPath)) {
      return res
        .status(404)
        .json({ message: "No results found for this subject code." });
    }

    const filePath = path.join(resultFolderPath, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Result file not found." });
    }

    const result = await csvToJson(filePath);

    return res.status(200).json({ result });
  } catch (error) {
    console.error("Error downloading result:", error);
    return res
      .status(500)
      .json({ message: "Failed to download result", error: error.message });
  }
};

async function createAnswerPdf(subjectCode, userId, answerPdfName) {
  try {
    const extractedBookletPath = path.join(
      "processedFolder",
      subjectCode,
      answerPdfName,
    );

    console.log("🔍 Checking PDF path:", extractedBookletPath);

    if (!fs.existsSync(extractedBookletPath)) {
      console.error("❌ PDF not found at path:", extractedBookletPath);
      return false;
    }

    const pdfBytes = fs.readFileSync(extractedBookletPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const totalPages = pdfDoc.getPageCount();
    console.log(`📄 Total pages in original PDF: ${totalPages}`);

    if (totalPages <= 2) {
      console.log("❌ Cannot remove pages. PDF has 2 or fewer pages.");
      return false;
    }

    const newPdf = await PDFDocument.create();

    const copiedPages = await newPdf.copyPages(
      pdfDoc,
      [...Array(totalPages - 2).keys()].map((i) => i + 2),
    );

    copiedPages.forEach((p) => newPdf.addPage(p));

    const finalBytes = await newPdf.save();
    const filePath = path.join("designedFolder", subjectCode, userId);

    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(filePath, { recursive: true });
    }

    // Create subjectCode folder if missing

    const folderPath = path.join(filePath, answerPdfName);

    // Save the PDF bytes
    fs.writeFileSync(folderPath, finalBytes);

    console.log("✅ answerPdf.pdf created (first 2 pages removed)");
    return true;
  } catch (err) {
    console.error("❌ Error:", err);
    return false;
  }
}

const getCompletedBooklets = async (req, res) => {
  const { id, userId } = req.params;
  console.log("userId", userId);

  try {
    const task = await Task.findById(id)
      .where({ status: "success" })
      .select("subjectCode");

    const subjectCode = task?.subjectCode;

    const booklets = await AnswerPdf.find({ taskId: id, status: "true" });

    if (booklets.length === 0) {
      return res.status(404).json({ message: "No completed booklets found" });
    }

    const zipFiles = [];

    for (const booklet of booklets) {
      const success = await createAnswerPdf(
        subjectCode,
        userId,
        booklet.answerPdfName,
      );
      if (!success) {
        return res
          .status(500)
          .json({ message: "Failed to create answerPdf.pdf" });
      }

      const filePath = path.join(
        "designedFolder",
        subjectCode,
        userId,
        booklet.answerPdfName,
      );

      // Read the file
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Read the file

      // Embed fonts once
      const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      console.log("📄 Loaded answerPdf.pdf for annotations");

      const checkImg = await loadImage("check.png");
      const closeImg = await loadImage("close.png");

      async function embedImage(img) {
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return pdfDoc.embedPng(canvas.toBuffer());
      }

      const checkIcon = await embedImage(checkImg);
      const closeIcon = await embedImage(closeImg);

      // , --------------------------------------------------------
      // 4️⃣ DRAW ANNOTATIONS ON EVERY PAGE
      // --------------------------------------------------------
      const pageCount = pdfDoc.getPageCount();

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const page = pdfDoc.getPage(pageIndex);

        const { width, height } = page.getSize();
        // console.log("answerPdfId", String(booklet._id));

        const jsonPath = path.join(
          "Annotations",
          userId,
          String(booklet._id),
          `page_${pageIndex + 3}.json`,
        );

        if (!fs.existsSync(jsonPath)) {
          console.log(`⚠ No JSON for page ${pageIndex + 3}`);
          continue;
        }

        const { annotations } = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const a of annotations) {
          // --- SAFE POSITIONING ---
          let x = a.x;
          let y = a.y;

          if (x + 200 > width) x = width - 200;
          if (x < 20) x = 20;

          if (y < 60) y = 60;
          if (y > height - 60) y = height - 60;

          const icon = a.iconUrl.includes("check") ? checkIcon : closeIcon;
          const borderColor = a.iconUrl.includes("check")
            ? rgb(0, 0.6, 0)
            : rgb(1, 0, 0);

          const iconWidth = 30;
          const iconHeight = 30;

          // ⬤ ICON
          page.drawImage(icon, { x, y, width: iconWidth, height: iconHeight });

          // ⬤ Question text
          const qTextY = y - 18;
          const baseText = `Q${a.question} -> `;

          page.drawText(baseText, {
            x,
            y: qTextY,
            size: 12,
            color: rgb(0, 0, 0),
          });

          const textWidth = font.widthOfTextAtSize(baseText, 12);

          // ⬤ Circle for marks
          const circleX = x + textWidth + 10;
          const circleY = qTextY + 6;

          page.drawCircle({
            x: circleX,
            y: circleY,
            size: 10,
            borderWidth: 2,
            borderColor,
          });

          // ⭐ PERFECT CENTERED MARK NUMBER ⭐
          const markText = String(a.mark);
          const markWidth = font.widthOfTextAtSize(markText, 10);
          const markHeight = 10;

          page.drawText(markText, {
            x: circleX - markWidth / 2,
            y: circleY - markHeight / 2,
            size: 10,
            color: borderColor,
          });

          // ⬤ Date + Time
          const [datePart, timePart] = a.timeStamps.split(",");

          page.drawText(datePart.trim(), {
            x,
            y: y - 35,
            size: 10,
            color: rgb(0.3, 0.3, 0.3),
          });

          page.drawText(timePart.trim(), {
            x,
            y: y - 47,
            size: 10,
            color: rgb(0.3, 0.3, 0.3),
          });
        }
      }

      // --------------------------------------------------------
      // ⭐⭐⭐ ADD SUMMARY PAGE *BEFORE* SAVING RESULTED PDF ⭐⭐⭐
      // --------------------------------------------------------

      // 1️⃣ COLLECT SUMMARY + TOTAL MARKS
      let summaryData = [];
      let totalMarks = 0;

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const jsonPath = path.join(
          "Annotations",
          String(booklet._id),
          `page_${pageIndex + 3}.json`, // keep your offset if correct
        );

        if (!fs.existsSync(jsonPath)) continue;

        const { annotations } = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

        const tasks = await Task.find({ subjectCode }).populate(
          "userId",
          "email",
        );

        const taskUserMap = tasks.reduce((map, t) => {
          if (t.userId && t.userId.email) {
            map[t._id.toString()] = t.userId.email;
          }
          return map;
        }, {});

        for (const a of annotations) {
          summaryData.push({
            question: `Q${a.question}`,
            marks: a.mark,
            page: pageIndex + 3,
            time: a.timeStamps || "N/A",
            evaluator: taskUserMap?.[booklet.taskId] || "N/A",
          });

          totalMarks += Number(a.mark);
        }
      }

      // 2️⃣ ADD SUMMARY PAGE AS FIRST PAGE
      const summaryPage = pdfDoc.addPage();
      const { width: sw, height: sh } = summaryPage.getSize();

      summaryPage.drawText(`Booklet Name: ${booklet.answerPdfName}`, {
        x: 50,
        y: sh - 40,
        size: 18,
        font: fontBold,
      });

      // 3️⃣ TABLE HEADERS
      const startX = 50;
      let startY = sh - 80;
      const rowHeight = 25;

      const colWidths = [100, 80, 80, 180, 150];
      const headers = ["Question", "Marks", "Page No", "Time", "Evaluator"];

      headers.forEach((header, i) => {
        const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        summaryPage.drawText(header, {
          x,
          y: startY,
          size: 12,
          font: fontBold,
        });
      });

      startY -= 20;

      // 4️⃣ TABLE ROWS
      summaryData.forEach((row) => {
        const values = [
          row.question,
          String(row.marks),
          String(row.page),
          row.time,
          row.evaluator,
        ];

        values.forEach((text, i) => {
          const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          summaryPage.drawText(text, {
            x,
            y: startY,
            size: 11,
            font: fontNormal,
          });
        });

        startY -= rowHeight;
      });

      // 5️⃣ TOTAL MARKS
      summaryPage.drawText(`Total Marks: ${totalMarks}`, {
        x: sw - 200,
        y: startY - 10,
        size: 14,
        font: fontBold,
      });

      // SAVE FINAL OUTPUT
      const finalBytes = await pdfDoc.save();
      const dirPath = path.join("resultedFolder", userId, subjectCode);

      // Create folder if not exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Build file path: resultedFolder/<subjectCode>/<answerPdfName>
      const resultedFilePath = path.join(
        "resultedFolder",
        subjectCode,
        booklet.answerPdfName,
      );
      fs.writeFileSync(resultedFilePath, finalBytes);

      console.log("🎉 output.pdf created with PERFECT annotations!");

      zipFiles.push({
        name: booklet.answerPdfName,
        buffer: Buffer.from(finalBytes),
      });
    }

    res.setHeader("content-type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${subjectCode}_completedBooklets.zip`,
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of zipFiles) {
      archive.append(file.buffer, { name: file.name });
    }

    await archive.finalize();
  } catch (error) {
    console.error("Error fetching completed booklets:", error);
    res.status(500).json({
      message: "Failed to fetch and process completed booklets.",
      error: error.message,
    });
  }
};

const downloadCompletedBooklets = async (req, res) => {
  try {
    const { subjectCode } = req.params;

    console.log("📘 Subject Code for Download Booklets is this:", subjectCode);

    /* ------------------------------------------ */
    /* 1️⃣ GET SUBJECT + SCHEMA TYPE              */
    /* ------------------------------------------ */

    const subject = await Subject.findOne({ code: subjectCode });

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const relation = await CourseSchemaRelation.findOne({
      subjectId: subject._id,
    });

    if (!relation) {
      return res.status(404).json({ message: "Schema relation not found" });
    }

    const schema = await Schema.findById(relation.schemaId);

    const schemaType = schema.schemaType;

    let booklets = [];
    let annotationFolder = "";
    let isQuestionWise = false;

    /* ------------------------------------------ */
    /* 2️⃣ FETCH COMPLETED BOOKLETS               */
    /* ------------------------------------------ */

    if (schemaType === "question_wise") {
      isQuestionWise = true;

      const tasks = await Task.find({ subjectCode });

      const taskIds = tasks.map((t) => t._id);

      booklets = await AnswerPdf.find({
        taskId: { $in: taskIds },
      });

      // console.log('SECC++++++++++++',booklets)
      annotationFolder = "Annotations";
    }

    if (schemaType === "booklet_wise") {
      const bookletTasks = await BookletTask.find({ subjectCode });

      const taskIds = bookletTasks.map((t) => t._id);

      console.log("Tasks found for booklet-wise schema:", taskIds);

      booklets = await BookletAnswerPdf.find({
        bookletTaskId: { $in: taskIds },
        status: "true",
      });

      console.log("Booklets found for booklet-wise schema:", booklets);

      annotationFolder = "BookletAnnotations";
    }

    for (const booklet of booklets) {
      if (booklet.status === "false") {
        return res.status(404).json({
          message: "All questions are not evaluated",
        });
      }
    }

    if (!booklets.length) {
      return res.status(404).json({
        message: "No evaluated booklets found",
      });
    }

    /* ------------------------------------------ */
    /* 3️⃣ PREPARE ZIP STREAM                     */
    /* ------------------------------------------ */

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${subjectCode}_completed_booklets.zip`,
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(res);

    /* ------------------------------------------ */
    /* LOAD CHECK AND CLOSE ICONS                 */
    /* ------------------------------------------ */

    const checkIconBytes = fs.readFileSync(
      path.join(process.cwd(), "Red_Check.png"),
    );
    const blackCheckBytes = fs.readFileSync(
      path.join(process.cwd(), "Black_Check.png"),
    );
    const closeIconBytes = fs.readFileSync(
      path.join(process.cwd(), "close.png"),
    );
    const blank1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "blank1.png"),
    );
    const blank2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "blank2.png"),
    );
    const blank3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "blank3.png"),
    );
    const check1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "check1.png"),
    );
    const check2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "check2.png"),
    );
    const check3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "check3.png"),
    );
    const circle1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "circle1.png"),
    );
    const circle2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "circle2.png"),
    );
    const circle3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "circle3.png"),
    );
    const cross1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "cross1.png"),
    );
    const cross2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "cross2.png"),
    );
    const cross3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "cross3.png"),
    );
    const line1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "line1.png"),
    );
    const line2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "line2.png"),
    );
    const line3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "line3.png"),
    );
    const not_attempted1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "not_attempt1.png"),
    );
    const not_attempted2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "not_attempt2.png"),
    );
    const not_attempted3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "not_attempt3.png"),
    );
    const question1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "question1.png"),
    );
    const question2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "question2.png"),
    );
    const question3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "question3.png"),
    );
    const slantline1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "slantline1.png"),
    );
    const slantline2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "slantline2.png"),
    );
    const slantline3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "slantline3.png"),
    );
    const rough1IconBytes = fs.readFileSync(
      path.join(process.cwd(), "rough1.png"),
    );
    const rough2IconBytes = fs.readFileSync(
      path.join(process.cwd(), "rough2.png"),
    );
    const rough3IconBytes = fs.readFileSync(
      path.join(process.cwd(), "rough3.png"),
    );
    const eye1IconBytes = fs.readFileSync(path.join(process.cwd(), "eye1.png"));
    const eye2IconBytes = fs.readFileSync(path.join(process.cwd(), "eye2.png"));
    const eye3IconBytes = fs.readFileSync(path.join(process.cwd(), "eye3.png"));
    const limit = pLimit(10);
    /* ------------------------------------------ */
    /* 4️⃣ PROCESS EACH BOOKLET                   */
    /* ------------------------------------------ */
    if (schemaType === "booklet_wise") {
      // for (const booklet of booklets) {
      await Promise.all(
        booklets.map(async (booklet) =>
          limit(async () => {
            const imageFolder = path.join(
              "processedFolder",
              subjectCode,
              "bookletWiseExtracted",
              booklet.answerPdfName.replace(".pdf", ""),
            );

            if (!fs.existsSync(imageFolder)) {
              console.log("Image folder not found:", imageFolder);
              return;
            }

            const imageFiles = fs
              .readdirSync(imageFolder)
              .filter((f) => f.endsWith(".png"))
              .sort((a, b) => {
                const n1 = Number(a.match(/\d+/)[0]);
                const n2 = Number(b.match(/\d+/)[0]);
                return n1 - n2;
              });

            const pdfDoc = await PDFDocument.create();

            const [
              checkIcon,
              closeIcon,
              blackCheckIcon,
              blank1Icon,
              blank2Icon,
              blank3Icon,
              check1Icon,
              check2Icon,
              check3Icon,
              circle1Icon,
              circle2Icon,
              circle3Icon,
              cross1Icon,
              cross2Icon,
              cross3Icon,
              line1Icon,
              line2Icon,
              line3Icon,
              notattempted1Icon,
              notattempted2Icon,
              notattempted3Icon,
              question1Icon,
              question2Icon,
              question3Icon,
              slantline1Icon,
              slantline2Icon,
              slantline3Icon,
              rough1Icon,
              rough2Icon,
              rough3Icon,
              eye1Icon,
              eye2Icon,
              eye3Icon,
            ] = await Promise.all([
              pdfDoc.embedPng(checkIconBytes),
              pdfDoc.embedPng(closeIconBytes),
              pdfDoc.embedPng(blackCheckBytes),
              pdfDoc.embedPng(blank1IconBytes),
              pdfDoc.embedPng(blank2IconBytes),
              pdfDoc.embedPng(blank3IconBytes),
              pdfDoc.embedPng(check1IconBytes),
              pdfDoc.embedPng(check2IconBytes),
              pdfDoc.embedPng(check3IconBytes),
              pdfDoc.embedPng(circle1IconBytes),
              pdfDoc.embedPng(circle2IconBytes),
              pdfDoc.embedPng(circle3IconBytes),
              pdfDoc.embedPng(cross1IconBytes),
              pdfDoc.embedPng(cross2IconBytes),
              pdfDoc.embedPng(cross3IconBytes),
              pdfDoc.embedPng(line1IconBytes),
              pdfDoc.embedPng(line2IconBytes),
              pdfDoc.embedPng(line3IconBytes),
              pdfDoc.embedPng(not_attempted1IconBytes),
              pdfDoc.embedPng(not_attempted2IconBytes),
              pdfDoc.embedPng(not_attempted3IconBytes),
              pdfDoc.embedPng(question1IconBytes),
              pdfDoc.embedPng(question2IconBytes),
              pdfDoc.embedPng(question3IconBytes),
              pdfDoc.embedPng(slantline1IconBytes),
              pdfDoc.embedPng(slantline2IconBytes),
              pdfDoc.embedPng(slantline3IconBytes),
              pdfDoc.embedPng(rough1IconBytes),
              pdfDoc.embedPng(rough2IconBytes),
              pdfDoc.embedPng(rough3IconBytes),
              pdfDoc.embedPng(eye1IconBytes),
              pdfDoc.embedPng(eye2IconBytes),
              pdfDoc.embedPng(eye3IconBytes),
            ]);

            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(
              StandardFonts.HelveticaBold,
            );
            let questionMaxMarks = {};
            let summaryData = [];
            let totalMarks = 0;

            const bookletTasks = await BookletTask.find({
              subjectCode,
            });

            const users = await User.find({
              _id: {
                $in: bookletTasks.map((t) => t.userId),
              },
            }).select("_id email");

            let annotationMap = {};

            for (const user of users) {
              const annotationPath = path.join(
                "BookletAnnotations",
                String(user._id),
                String(booklet._id),
              );

              const marksDataPath = path.join(annotationPath, "marksData.json");

              if (fs.existsSync(marksDataPath)) {
                const marksData = JSON.parse(
                  fs.readFileSync(marksDataPath, "utf8"),
                );

                for (const q of marksData.marks || []) {
                  if (!q.isSubQuestion) {
                    questionMaxMarks[q.questionsName] = Number(q.maxMarks || 0);
                  }
                }
              }

              console.log("QUESTION MAX MARKS", questionMaxMarks);
              console.log("MARKS DATA PATH:", marksDataPath);
              console.log("MARKS DATA EXISTS:", fs.existsSync(marksDataPath));

              if (!fs.existsSync(annotationPath)) {
                continue;
              }

              const jsonFiles = fs
                .readdirSync(annotationPath)
                .filter((f) => f.startsWith("page_") && f.endsWith(".json"));

              for (const file of jsonFiles) {
                const pageNumber = Number(file.match(/\d+/)[0]);

                const json = JSON.parse(
                  fs.readFileSync(path.join(annotationPath, file), "utf8"),
                );

                if (!annotationMap[pageNumber]) {
                  annotationMap[pageNumber] = [];
                }

                const annotations = json.annotations || [];

                annotations.forEach((a) => {
                  annotationMap[pageNumber].push({
                    ...a,
                    evaluatorEmail: user.email,
                  });
                });
              }
            }

            for (let i = 0; i < imageFiles.length; i++) {
              const imageName = imageFiles[i];
              const pageNumber = Number(imageName.match(/\d+/)[0]);

              const imagePath = path.join(imageFolder, imageName);

              const imgBytes = fs.readFileSync(imagePath);
              const png = await pdfDoc.embedPng(imgBytes);

              const page = pdfDoc.addPage([png.width, png.height]);

              page.drawImage(png, {
                x: 0,
                y: 0,
                width: png.width,
                height: png.height,
              });

              const annotations = annotationMap[pageNumber] || [];

              for (const a of annotations) {
                let icon;
                console.log("ICON URL:", a.iconUrl);

                switch (true) {
                  case a.iconUrl && a.iconUrl.includes("Red"):
                    icon = checkIcon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("Black"):
                    icon = blackCheckIcon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("blank1"):
                    icon = blank1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("blank2"):
                    icon = blank2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("blank3"):
                    icon = blank3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("check1"):
                    icon = check1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("check2"):
                    icon = check2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("check3"):
                    icon = check3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("circle1"):
                    icon = circle1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("circle2"):
                    icon = circle2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("circle3"):
                    icon = circle3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("cross1"):
                    icon = cross1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("cross2"):
                    icon = cross2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("cross3"):
                    icon = cross3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("line1"):
                    icon = line1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("line2"):
                    icon = line2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("line3"):
                    icon = line3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("not_attempt1"):
                    icon = notattempted1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("not_attempt2"):
                    icon = notattempted2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("not_attempt3"):
                    icon = notattempted3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("question1"):
                    icon = question1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("question2"):
                    icon = question2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("question3"):
                    icon = question3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("slantline1"):
                    icon = slantline1Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("slantline2"):
                    icon = slantline2Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("slantline3"):
                    icon = slantline3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("eye1"):
                    icon = eye1Icon;
                    break;

                  case a.iconUrl && a.iconUrl.includes("eye2"):
                    icon = eye2Icon;
                    break;

                  case a.iconUrl && a.iconUrl.includes("eye3"):
                    icon = eye3Icon;
                    break;

                  case a.iconUrl && a.iconUrl.includes("rough1"):
                    icon = rough1Icon;
                    break;

                  case a.iconUrl && a.iconUrl.includes("rough2"):
                    icon = rough2Icon;
                    break;

                  case a.iconUrl && a.iconUrl.includes("rough3"):
                    icon = rough3Icon;
                    break;
                  case a.iconUrl && a.iconUrl.includes("close"):
                    icon = closeIcon;
                    break;

                  default:
                    icon = "noicon";
                }

                const pageHeight = page.getHeight();

                const emailIndex = users.findIndex(
                  (u) => u.email === a.evaluatorEmail,
                );

                const offsetY = emailIndex * 60;

                //---------- Icon Size ----------
                if (icon !== "noicon") {
                  page.drawImage(icon, {
                    x: Number(a.x),
                    y: pageHeight - Number(a.y) - a.height - offsetY,
                    width: a.width + 20,
                    height: a.height + 20,
                  });
                  page.drawImage(icon, {
                    x: Number(a.x),
                    y: pageHeight - Number(a.y) - a.height - offsetY,
                    width: a.width + 20,
                    height: a.height + 20,
                  });

                  const timestamp = a.timeStamps || "";

                  page.drawText(timestamp, {
                    x: Number(a.x) + a.width + 5,
                    y: pageHeight - Number(a.y) - 15 - offsetY,
                    size: 14,
                    font,
                  });
                }

                //---------- Question Text Size ----------
                if (icon == "noicon") {
                  const emailIndex = users.findIndex(
                    (u) => u.email === a.evaluatorEmail,
                  );

                  const offsetY = emailIndex * 60;

                  const timestamp = a.timeStamps || "";

                  const centerX = Number(a.x) + 180;
                  const centerY = pageHeight - Number(a.y) - 79 - offsetY;

                  // ---------------- Question Number ----------------

                  page.drawText(`Q${a.question}`, {
                    x: centerX - 40,
                    y: centerY + 75,
                    size: 22,
                    font,
                  });

                  // ---------------- Marks Circle ----------------

                  page.drawCircle({
                    x: centerX,
                    y: centerY,
                    size: 50,
                    borderColor: rgb(0, 0.6, 0),
                    borderWidth: 7,
                  });

                  // ---------------- Marks ----------------

                  page.drawText(String(a.mark), {
                    x: centerX - 18,
                    y: centerY - 18,
                    size: 34,
                    font,
                  });

                  // ---------------- Evaluator ----------------

                  page.drawText(a.evaluatorEmail || "", {
                    x: centerX - 120,
                    y: centerY - 90,
                    size: 18,
                    font,
                  });

                  // ---------------- Timestamp ----------------

                  page.drawText(timestamp, {
                    x: centerX - 120,
                    y: centerY - 115,
                    size: 16,
                    font,
                  });
                }

                if (
                  a.mark !== undefined &&
                  a.mark !== null &&
                  Number(a.mark) > 0
                ) {
                  summaryData.push({
                    question: `Q${a.question}`,
                    marks: Number(a.mark),
                    maxMarks: Number(questionMaxMarks[a.question] || 0),
                    page: pageNumber,
                    time: a.timeStamps || "",
                    email: a.evaluatorEmail,
                  });
                }
                totalMarks += Number(a.mark);
              }
            }

            console.log("SUMMARY DATA");
            console.log(JSON.stringify(summaryData, null, 2));

            const groupedSummary = {};

            for (const row of summaryData) {
              if (!groupedSummary[row.email]) {
                groupedSummary[row.email] = {
                  rows: [],
                  total: 0,
                };
              }

              groupedSummary[row.email].rows.push(row);
              groupedSummary[row.email].total += Number(row.marks || 0);
            }

            console.log("GROUPED SUMMARY", groupedSummary);

            const bookletMaxMarks = Object.values(questionMaxMarks).reduce(
              (sum, marks) => sum + Number(marks || 0),
              0,
            );

            /* SUMMARY PAGE */

            const summaryPage = pdfDoc.addPage([1300, 2500]);

            const { width, height } = summaryPage.getSize();

            summaryPage.drawText(`Booklet Name: ${booklet.answerPdfName}`, {
              x: 50,
              y: height - 40,
              size: 18,
              font: fontBold,
            });

            let y = height - 80;

            for (const [email, data] of Object.entries(groupedSummary)) {
              summaryPage.drawText(`Evaluator : ${email}`, {
                x: 50,
                y,
                size: 15,
                font: fontBold,
              });

              y -= 30;

              summaryPage.drawText("Question", {
                x: 50,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage.drawText("Marks", {
                x: 180,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage.drawText("Page", {
                x: 280,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage.drawText("Time", {
                x: 380,
                y,
                size: 12,
                font: fontBold,
              });

              y -= 25;

              for (const row of data.rows) {
                summaryPage.drawText(row.question, {
                  x: 50,
                  y,
                  size: 10,
                  font,
                });

                summaryPage.drawText(`${row.marks}/${row.maxMarks}`, {
                  x: 180,
                  y,
                  size: 10,
                  font,
                });

                summaryPage.drawText(String(row.page), {
                  x: 280,
                  y,
                  size: 10,
                  font,
                });

                summaryPage.drawText(row.time || "-", {
                  x: 380,
                  y,
                  size: 10,
                  font,
                });

                y -= 18;
              }

              summaryPage.drawText(`TOTAL : ${data.total}/${bookletMaxMarks}`, {
                x: 50,
                y,
                size: 13,
                font: fontBold,
              });

              y -= 50;
            }

            const finalBytes = await pdfDoc.save();

            archive.append(Buffer.from(finalBytes), {
              name: booklet.answerPdfName,
            });
          }),
        ),
      );
    } else {
      const grouped = {};

      booklets.forEach((doc) => {
        if (!grouped[doc.answerPdfName]) {
          grouped[doc.answerPdfName] = {
            answerPdfName: doc.answerPdfName,
            documents: [],
          };
        }

        grouped[doc.answerPdfName].documents.push({
          _id: doc._id,
          taskId: doc.taskId,
          questionDefinitionId: doc.questiondefinitionId,
        });
      });

      const result = Object.values(grouped);
      console.log("Grouped Booklets:", result);

      // Limit concurrency to 2

      await Promise.all(
        result.map(async (booklet) =>
          limit(async () => {
            console.log("booklet", booklet);

            const documentMeta = await Promise.all(
              booklet.documents.map(async (value) => {
                const [task, questionDef] = await Promise.all([
                  Task.findById(value.taskId).lean(),
                  QuestionDefinition.findById(
                    value.questionDefinitionId,
                  ).lean(),
                ]);

                const userRole = await User.findById(task.userId).lean();

                return {
                  value,
                  task,
                  questionDef,
                  userRole,
                };
              }),
            );

            const imageFolder = path.join(
              "processedFolder",
              subjectCode,
              "extractedBooklets",
              booklet.answerPdfName.replace(".pdf", ""),
            );

            if (!fs.existsSync(imageFolder)) {
              console.log("Image folder not found:", imageFolder);
              return;
            }

            const imageFiles = fs
              .readdirSync(imageFolder)
              .filter((f) => f.endsWith(".png"))
              .sort((a, b) => {
                const n1 = Number(a.match(/\d+/)[0]);
                const n2 = Number(b.match(/\d+/)[0]);
                return n1 - n2;
              });

            const pdfDoc = await PDFDocument.create();
            const pdfDocWithoutIcon = await PDFDocument.create();

            const [
              checkIcon,
              closeIcon,
              blackCheckIcon,
              blank1Icon,
              blank2Icon,
              blank3Icon,
              check1Icon,
              check2Icon,
              check3Icon,
              circle1Icon,
              circle2Icon,
              circle3Icon,
              cross1Icon,
              cross2Icon,
              cross3Icon,
              line1Icon,
              line2Icon,
              line3Icon,
              notattempted1Icon,
              notattempted2Icon,
              notattempted3Icon,
              question1Icon,
              question2Icon,
              question3Icon,
              slantline1Icon,
              slantline2Icon,
              slantline3Icon,
              rough1Icon,
              rough2Icon,
              rough3Icon,
              eye1Icon,
              eye2Icon,
              eye3Icon,
            ] = await Promise.all([
              pdfDoc.embedPng(checkIconBytes),
              pdfDoc.embedPng(closeIconBytes),
              pdfDoc.embedPng(blackCheckBytes),
              pdfDoc.embedPng(blank1IconBytes),
              pdfDoc.embedPng(blank2IconBytes),
              pdfDoc.embedPng(blank3IconBytes),
              pdfDoc.embedPng(check1IconBytes),
              pdfDoc.embedPng(check2IconBytes),
              pdfDoc.embedPng(check3IconBytes),
              pdfDoc.embedPng(circle1IconBytes),
              pdfDoc.embedPng(circle2IconBytes),
              pdfDoc.embedPng(circle3IconBytes),
              pdfDoc.embedPng(cross1IconBytes),
              pdfDoc.embedPng(cross2IconBytes),
              pdfDoc.embedPng(cross3IconBytes),
              pdfDoc.embedPng(line1IconBytes),
              pdfDoc.embedPng(line2IconBytes),
              pdfDoc.embedPng(line3IconBytes),
              pdfDoc.embedPng(not_attempted1IconBytes),
              pdfDoc.embedPng(not_attempted2IconBytes),
              pdfDoc.embedPng(not_attempted3IconBytes),
              pdfDoc.embedPng(question1IconBytes),
              pdfDoc.embedPng(question2IconBytes),
              pdfDoc.embedPng(question3IconBytes),
              pdfDoc.embedPng(slantline1IconBytes),
              pdfDoc.embedPng(slantline2IconBytes),
              pdfDoc.embedPng(slantline3IconBytes),
              pdfDoc.embedPng(rough1IconBytes),
              pdfDoc.embedPng(rough2IconBytes),
              pdfDoc.embedPng(rough3IconBytes),
              pdfDoc.embedPng(eye1IconBytes),
              pdfDoc.embedPng(eye2IconBytes),
              pdfDoc.embedPng(eye3IconBytes),
            ]);

            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(
              StandardFonts.HelveticaBold,
            );

            const font2 = await pdfDocWithoutIcon.embedFont(
              StandardFonts.Helvetica,
            );
            const fontBold2 = await pdfDocWithoutIcon.embedFont(
              StandardFonts.HelveticaBold,
            );

            let summaryData = [];
            let users = [];
            let totalMarks = 0;

            // for (const value of booklet.documents) {
            //   const task = await Task.findById(value.taskId);
            //   const userId = task.userId;
            //   console.log(userId);
            //   let annotationPath;

            //   if (task.evaluatorId) {
            //     annotationPath = path.join(
            //       "Annotations",
            //       String(task.evaluatorId),
            //       String(value._id),
            //       String(userId),
            //     );
            //   } else {
            //     annotationPath = path.join(
            //       "Annotations",
            //       String(userId),
            //       String(value._id),
            //     );
            //   }

            let allAnnotations = [];

            for (let i = 0; i < imageFiles.length; i++) {
              const imageName = imageFiles[i];
              const pageNumber = Number(imageName.match(/\d+/)[0]);

              const imagePath = path.join(imageFolder, imageName);
              const imgBytes = await fs.promises.readFile(imagePath);
              const png = await pdfDoc.embedPng(imgBytes);
              const png2 = await pdfDocWithoutIcon.embedPng(imgBytes);
              console.log(png.width, png.height);
              const page = pdfDoc.addPage([png.width, png.height]);
              const page2 = pdfDocWithoutIcon.addPage([
                png2.width,
                png2.height,
              ]);

              page.drawImage(png, {
                x: 0,
                y: 0,
                width: png.width,
                height: png.height,
              });
              page2.drawImage(png2, {
                x: 0,
                y: 0,
                width: png2.width,
                height: png2.height,
              });

              const pageAnnotationData = await Promise.all(
                documentMeta.map(async (meta) => {
                  const { value, task, questionDef, userRole } = meta;
                  const userId = task.userId;

                  let annotationPath;

                  if (userRole?.role === "headevaluator") {
                    annotationPath = path.join(
                      "Annotations",
                      String(task.evaluatorId),
                      String(value._id),
                      String(userId),
                    );
                  } else {
                    annotationPath = path.join(
                      "Annotations",
                      String(userId),
                      String(value._id),
                    );
                  }

                  const jsonPath = path.join(
                    annotationPath,
                    `page_${pageNumber}.json`,
                  );

                  try {
                    const jsonContent = await fs.promises.readFile(
                      jsonPath,
                      "utf8",
                    );
                    const json = JSON.parse(jsonContent);

                    return {
                      meta,
                      annotations: json.annotations || [],
                    };
                  } catch {
                    // File does not exist or JSON is invalid
                    return null;
                  }
                }),
              );
              // 🔥 LOOP DOCUMENTS INSIDE PAGE
              for (const item of pageAnnotationData) {
                if (!item) continue;
                const { meta, annotations } = item;
                const { questionDef } = meta;

                if (
                  questionDef &&
                  questionDef.questionsName &&
                  questionDef.maxMarks !== undefined
                ) {
                  questionMaxMarks[questionDef.questionsName] = Number(
                    questionDef.maxMarks,
                  );
                }

                // console.log(value)
                // const task = await Task.findById(value.taskId);
                // const userId = task.userId;

                // const userRole = await User.findById(userId);
                // const questionDef = await QuestionDefinition.findById(
                //   value.questionDefinitionId,
                // );
                // console.log(questionDef)
                // const { value, task, questionDef, userRole } = meta;
                // const userId = task.userId;

                // let annotationPath;

                // if (userRole?.role === "headevaluator") {
                //   annotationPath = path.join(
                //     "Annotations",
                //     String(task.evaluatorId),
                //     String(value._id),
                //     String(userId),
                //   );
                // } else {
                //   annotationPath = path.join(
                //     "Annotations",
                //     String(userId),
                //     String(value._id),
                //   );
                // }

                // const jsonPath = path.join(
                //   annotationPath,
                //   `page_${pageNumber}.json`,
                // );

                // if (!fs.existsSync(jsonPath)) continue;

                // const json = JSON.parse(fs.readFileSync(jsonPath));
                // const annotations = json.annotations || [];
                // // console.log( 'annotations',annotations)

                let displacement;

                if (
                  questionDef.page.includes(pageNumber) &&
                  questionDef.coordinates.partialAreas &&
                  questionDef.coordinates.partialAreas.hasOwnProperty(
                    pageNumber,
                  )
                ) {
                  console.log("trueeeeeeeeeeeeeeeeeeeeeeeeeeeee");
                  displacement =
                    questionDef.coordinates.partialAreas[pageNumber][0];
                } else {
                  console.log("falseeeeeeeeeeeeeeeeeeeeeeeeeee");
                  displacement = { x: 0, y: 0 };
                }
                for (const a of annotations) {
                  let icon;
                  // console.log("annotations", a);

                  switch (true) {
                    case a.iconUrl && a.iconUrl.includes("Red"):
                      icon = checkIcon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("Black"):
                      icon = blackCheckIcon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("blank1"):
                      icon = blank1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("blank2"):
                      icon = blank2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("blank3"):
                      icon = blank3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("check1"):
                      icon = check1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("check2"):
                      icon = check2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("check3"):
                      icon = check3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("circle1"):
                      icon = circle1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("circle2"):
                      icon = circle2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("circle3"):
                      icon = circle3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("cross1"):
                      icon = cross1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("cross2"):
                      icon = cross2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("cross3"):
                      icon = cross3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("line1"):
                      icon = line1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("line2"):
                      icon = line2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("line3"):
                      icon = line3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("not_attempt1"):
                      icon = notattempted1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("not_attempt2"):
                      icon = notattempted2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("not_attempt3"):
                      icon = notattempted3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("question1"):
                      icon = question1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("question2"):
                      icon = question2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("question3"):
                      icon = question3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("slantline1"):
                      icon = slantline1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("slantline2"):
                      icon = slantline2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("slantline3"):
                      icon = slantline3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("eye1"):
                      icon = eye1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("eye2"):
                      icon = eye2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("eye3"):
                      icon = eye3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("rough1"):
                      icon = rough1Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("rough2"):
                      icon = rough2Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("rough3"):
                      icon = rough3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("eye1"):
                      icon = eye1Icon;
                      break;

                    case a.iconUrl && a.iconUrl.includes("eye2"):
                      icon = eye2Icon;
                      break;

                    case a.iconUrl && a.iconUrl.includes("eye3"):
                      icon = eye3Icon;
                      break;

                    case a.iconUrl && a.iconUrl.includes("rough1"):
                      icon = rough1Icon;
                      break;

                    case a.iconUrl && a.iconUrl.includes("rough2"):
                      icon = rough2Icon;
                      break;

                    case a.iconUrl && a.iconUrl.includes("rough3"):
                      icon = rough3Icon;
                      break;
                    case a.iconUrl && a.iconUrl.includes("close"):
                      icon = closeIcon;
                      break;

                    default:
                      icon = "noicon";
                  }

                  const pageHeight = page.getHeight();
                  const pageHeight2 = page2.getHeight();

                  if (icon !== "noicon") {
                    page.drawImage(icon, {
                      x: Number(a.x) + displacement.x,
                      y: pageHeight - (Number(a.y) + displacement.y) - a.height,
                      width: a.width,
                      height: a.height,
                    });
                  }

                  if (icon == "noicon") {
                    page.drawText(`Q${a.question}`, {
                      x: Number(a.x) + displacement.x + 5,
                      y: pageHeight - (Number(a.y) + displacement.y) - 85,
                      size: 12,
                      font,
                    });
                    page2.drawText(`Q${a.question}`, {
                      x: Number(a.x) + displacement.x + 5,
                      y: pageHeight2 - (Number(a.y) + displacement.y) - 85,
                      size: 12,
                      font2,
                    });

                    page.drawCircle({
                      x: Number(a.x) + displacement.x + 55,
                      y: pageHeight - (Number(a.y) + displacement.y) - 79,
                      size: 10,
                      borderColor: rgb(0, 0.6, 0),
                      borderWidth: 2,
                    });
                    page2.drawCircle({
                      x: Number(a.x) + displacement.x + 55,
                      y: pageHeight2 - (Number(a.y) + displacement.y) - 79,
                      size: 10,
                      borderColor: rgb(0, 0.6, 0),
                      borderWidth: 2,
                    });

                    const timestamp = a.timeStamps || "";

                    page.drawText(String(a.mark), {
                      x: Number(a.x) + displacement.x + 55,
                      y: pageHeight - (Number(a.y) + displacement.y) - 85,
                      size: 12,
                      font,
                    });

                    page.drawText(timestamp, {
                      x: Number(a.x) + displacement.x + 80,
                      y: pageHeight - (Number(a.y) + displacement.y) - 85,
                      size: 8,
                      font,
                    });

                    page2.drawText(String(a.mark), {
                      x: Number(a.x) + displacement.x + 55,
                      y: pageHeight2 - (Number(a.y) + displacement.y) - 85,
                      size: 12,
                      font2,
                    });

                    page2.drawText(timestamp, {
                      x: Number(a.x) + displacement.x + 80,
                      y: pageHeight2 - (Number(a.y) + displacement.y) - 85,
                      size: 8,
                      font: font2,
                    });
                  }

                  summaryData.push({
                    question: `Q${a.question}`,
                    marks: Number(a.mark),
                    maxMarks:
                      questionMaxMarks[a.question] ??
                      questionMaxMarks[`Q${a.question}`] ??
                      0,
                    page: pageNumber,
                    time: a.timeStamps || "",
                    user: a.email,
                  });

                  if (!users.includes(a.email)) {
                    users.push(a.email);
                  }

                  // totalMarks += Number(a.mark);
                }
                allAnnotations.push(...annotations);
              }
            }

            console.log("allAnnotations-------------", allAnnotations);

            const groupedSummary = {};

            const bookletMaxMarks = Object.values(questionMaxMarks).reduce(
              (sum, marks) => sum + Number(marks || 0),
              0,
            );

            for (const row of summaryData) {
              if (!groupedSummary[row.user]) {
                groupedSummary[row.user] = {
                  rows: [],
                  total: 0,
                };
              }

              groupedSummary[row.user].rows.push(row);
              groupedSummary[row.user].total += Number(row.marks || 0);
            }

            let questionCount = [];

            for (const e of allAnnotations) {
              if (e.role == "headevaluator") {
                totalMarks += Number(e.mark);
                questionCount.push(e.question);
              }
            }

            for (const e of allAnnotations) {
              if (!questionCount.includes(e.question)) {
                totalMarks += Number(e.mark);
              }
            }
            const summaryPage = pdfDoc.insertPage(0, [1080, 1920]);
            const summaryPage2 = pdfDocWithoutIcon.insertPage(0, [1080, 1920]);

            const { width, height } = summaryPage.getSize();

            summaryPage.drawText(`Booklet Name: ${booklet.answerPdfName}`, {
              x: 50,
              y: height - 40,
              size: 18,
              font: fontBold,
            });
            summaryPage2.drawText(`Booklet Name: ${booklet.answerPdfName}`, {
              x: 50,
              y: height - 40,
              size: 18,
              font: fontBold2,
            });

            let y = height - 80;

            summaryPage.drawText("Question", {
              x: 50,
              y,
              size: 13,
              font: fontBold,
            });
            summaryPage2.drawText("Question", {
              x: 50,
              y,
              size: 13,
              font: fontBold2,
            });
            let coord = 150;
            let coordEmailPair = new Map();

            for (const e of users) {
              summaryPage.drawText(e, {
                x: coord,
                y,
                size: 11,
                font: fontBold,
              });
              summaryPage2.drawText(e, {
                x: coord,
                y,
                size: 11,
                font: fontBold2,
              });
              coordEmailPair.set(e, coord);
              coord += 100;
            }
            // summaryPage.drawText("Marks", { x: 150, y, size: 13, font: fontBold });
            summaryPage.drawText("Page", {
              x: coord,
              y,
              size: 13,
              font: fontBold,
            });
            summaryPage2.drawText("Page", {
              x: coord,
              y,
              size: 13,
              font: fontBold2,
            });
            coordEmailPair.set("page", coord);
            summaryPage.drawText("Time", {
              x: (coord += 120),
              y,
              size: 13,
              font: fontBold,
            });
            summaryPage2.drawText("Time", {
              x: coord,
              y,
              size: 13,
              font: fontBold2,
            });
            coordEmailPair.set("time", coord);
            // summaryPage.drawText("User", { x: coord+=120, y, size: 13, font: fontBold });

            // console.log(coordEmailPair)

            y -= 20;

            for (const [email, data] of Object.entries(groupedSummary)) {
              summaryPage.drawText(`Evaluator : ${email}`, {
                x: 50,
                y,
                size: 14,
                font: fontBold,
              });

              summaryPage2.drawText(`Evaluator : ${email}`, {
                x: 50,
                y,
                size: 14,
                font: fontBold2,
              });

              y -= 30;

              // Header
              summaryPage.drawText("Question", {
                x: 50,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage.drawText("Marks", {
                x: 180,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage.drawText("Page", {
                x: 280,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage.drawText("Time", {
                x: 380,
                y,
                size: 12,
                font: fontBold,
              });

              summaryPage2.drawText("Question", {
                x: 50,
                y,
                size: 12,
                font: fontBold2,
              });

              summaryPage2.drawText("Marks", {
                x: 180,
                y,
                size: 12,
                font: fontBold2,
              });

              summaryPage2.drawText("Page", {
                x: 280,
                y,
                size: 12,
                font: fontBold2,
              });

              summaryPage2.drawText("Time", {
                x: 380,
                y,
                size: 12,
                font: fontBold2,
              });

              y -= 25;

              for (const row of data.rows) {
                summaryPage.drawText(row.question, {
                  x: 50,
                  y,
                  size: 11,
                  font,
                });

                summaryPage.drawText(`${row.marks}/${row.maxMarks}`, {
                  x: 180,
                  y,
                  size: 11,
                  font,
                });

                summaryPage.drawText(String(row.page), {
                  x: 280,
                  y,
                  size: 11,
                  font,
                });

                summaryPage.drawText(row.time || "-", {
                  x: 380,
                  y,
                  size: 11,
                  font,
                });

                summaryPage2.drawText(row.question, {
                  x: 50,
                  y,
                  size: 11,
                  font: font2,
                });

                summaryPage2.drawText(`${row.marks}/${row.maxMarks}`, {
                  x: 180,
                  y,
                  size: 11,
                  font: font2,
                });

                summaryPage2.drawText(String(row.page), {
                  x: 280,
                  y,
                  size: 11,
                  font: font2,
                });

                summaryPage2.drawText(row.time || "-", {
                  x: 380,
                  y,
                  size: 11,
                  font: font2,
                });

                y -= 20;
              }

              summaryPage.drawText(`TOTAL : ${data.total}/${bookletMaxMarks}`, {
                x: 50,
                y,
                size: 13,
                font: fontBold,
              });

              summaryPage2.drawText(
                `TOTAL : ${data.total}/${bookletMaxMarks}`,
                {
                  x: 50,
                  y,
                  size: 13,
                  font: fontBold2,
                },
              );

              y -= 50;
            }

            const [finalBytes, finalBytes2] = await Promise.all([
              pdfDoc.save(),
              pdfDocWithoutIcon.save(),
            ]);

            archive.append(Buffer.from(finalBytes), {
              name: booklet.answerPdfName,
            });
            archive.append(Buffer.from(finalBytes2), {
              name: `${booklet.answerPdfName}_Without_Icon.pdf`,
            });
          }),
        ),
      );

      // for (const booklet of booklets) {
      //   const imageFolder = path.join(
      //     "processedFolder",
      //     subjectCode,
      //     "extractedBooklets",
      //     booklet.answerPdfName.replace(".pdf", ""),
      //   );

      //   if (!fs.existsSync(imageFolder)) {
      //     console.log("Image folder not found:", imageFolder);
      //     continue;
      //   }

      //   const imageFiles = fs
      //     .readdirSync(imageFolder)
      //     .filter((f) => f.endsWith(".png"))
      //     .sort((a, b) => {
      //       const n1 = Number(a.match(/\d+/)[0]);
      //       const n2 = Number(b.match(/\d+/)[0]);
      //       return n1 - n2;
      //     });

      //   const pdfDoc = await PDFDocument.create();

      //   const checkIcon = await pdfDoc.embedPng(checkIconBytes);
      //   const closeIcon = await pdfDoc.embedPng(closeIconBytes);

      //   const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      //   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      //   let summaryData = [];
      //   let totalMarks = 0;

      //   const task = await Task.findById(booklet.taskId);
      //   const userId = task.userId;

      //   const annotationPath = path.join(
      //     "Annotations",
      //     String(userId),
      //     String(booklet._id),
      //   );

      //   // let annotationMap = {};

      //   // if (fs.existsSync(annotationPath)) {
      //   //   const jsonFiles = fs
      //   //     .readdirSync(annotationPath)
      //   //     .filter((f) => f.startsWith("page_") && f.endsWith(".json"));

      //   //   for (const file of jsonFiles) {
      //   //     const pageNumber = Number(file.match(/\d+/)[0]);
      //   //     const json = JSON.parse(
      //   //       fs.readFileSync(path.join(annotationPath, file), "utf8"),
      //   //     );

      //   //     annotationMap[pageNumber] = json.annotations || [];
      //   //     // console.log(`LAAAAAAAAAAAAAAAA`, annotationMap)
      //   //   }
      //   // }
      //   for (let i = 0; i < imageFiles.length; i++) {
      //     const imageName = imageFiles[i];
      //     const pageNumber = Number(imageName.match(/\d+/)[0]);

      //     const imagePath = path.join(imageFolder, imageName);
      //     const imgBytes = fs.readFileSync(imagePath);
      //     const png = await pdfDoc.embedPng(imgBytes);

      //     const page = pdfDoc.addPage([png.width, png.height]);

      //     page.drawImage(png, {
      //       x: 0,
      //       y: 0,
      //       width: png.width,
      //       height: png.height,
      //     });

      //     const jsonPath = path.join(annotationPath, `page_${pageNumber}.json`);

      //     if (!fs.existsSync(jsonPath)) continue;

      //     const json = JSON.parse(fs.readFileSync(jsonPath));
      //     // console.log(json)
      //     const annotations = json.annotations || [];
      //     // console.log("1375", annotations);

      //     for (const a of annotations) {
      //       const icon =
      //         a.iconUrl && a.iconUrl.includes("Red") ? checkIcon : closeIcon;
      //       // console.log('1380',icon)
      //       //---------- Icon Size ----------
      //       page.drawImage(icon, {
      //         x: Number(a.x),
      //         y: Number(a.y),
      //         width: 50,
      //         height: 50,
      //       });

      //       //---------- Question Text Size ----------
      //       page.drawText(`Q${a.question}`, {
      //         x: Number(a.x) + 20,
      //         y: Number(a.y) + 8,
      //         size: 12,
      //         font,
      //       });

      //       //----------Mark Circle Size ------------
      //       page.drawCircle({
      //         x: Number(a.x) + 130,
      //         y: Number(a.y) + 25,
      //         size: 10,
      //         borderColor: rgb(0, 0.6, 0),
      //         borderWidth: 2,
      //       });

      //       //----------Mark Text Size ------------
      //       page.drawText(String(a.mark), {
      //         x: Number(a.x) + 123,
      //         y: Number(a.y) + 17,
      //         size: 10,
      //         font,
      //       });

      //       summaryData.push({
      //         question: `Q${a.question}`,
      //         marks: a.mark,
      //         page: pageNumber,
      //         time: a.timeStamps || "",
      //       });

      //       totalMarks += Number(a.mark);
      //     }
      //   }
      //   /* SUMMARY PAGE */

      //   const summaryPage = pdfDoc.addPage();

      //   const { width, height } = summaryPage.getSize();

      //   summaryPage.drawText(`Booklet Name: ${booklet.answerPdfName}`, {
      //     x: 50,
      //     y: height - 40,
      //     size: 18,
      //     font: fontBold,
      //   });

      //   let y = height - 80;

      //   summaryPage.drawText("Question", { x: 50, y, font: fontBold });
      //   summaryPage.drawText("Marks", { x: 150, y, font: fontBold });
      //   summaryPage.drawText("Page", { x: 250, y, font: fontBold });
      //   summaryPage.drawText("Time", { x: 350, y, font: fontBold });

      //   y -= 20;

      //   for (const row of summaryData) {
      //     summaryPage.drawText(row.question, { x: 50, y, size: 11, font });
      //     summaryPage.drawText(String(row.marks), {
      //       x: 150,
      //       y,
      //       size: 11,
      //       font,
      //     });
      //     summaryPage.drawText(String(row.page), { x: 250, y, size: 11, font });
      //     summaryPage.drawText(row.time, { x: 350, y, size: 11, font });

      //     y -= 20;
      //   }

      //   summaryPage.drawText(`Total Marks: ${totalMarks}`, {
      //     x: width - 200,
      //     y: y - 10,
      //     size: 14,
      //     font: fontBold,
      //   });

      //   const finalBytes = await pdfDoc.save();

      //   archive.append(Buffer.from(finalBytes), {
      //     name: booklet.answerPdfName,
      //   });
      // }
    }
    await archive.finalize();
  } catch (error) {
    console.error("Download error:", error);

    return res.status(500).json({
      message: "Failed to download booklets",
      error: error.message,
    });
  }
};

const downloadSubjectCsv = async (req, res) => {
  try {
    const { subjectCode } = req.params;

    console.log("Selected Subject Code:", subjectCode);

    if (!subjectCode) {
      return res.status(400).json({
        success: false,
        message: "Subject code is required.",
      });
    }

    // New folder structure:
    // opticView/{subjectCode}/csv/
    const csvFolder = path.join(process.cwd(), "opticView", subjectCode, "csv");

    if (!fs.existsSync(csvFolder)) {
      return res.status(404).json({
        success: false,
        message: "CSV folder not found.",
      });
    }

    const csvFiles = fs.readdirSync(csvFolder).filter((file) => {
      const filePath = path.join(csvFolder, file);

      return (
        fs.statSync(filePath).isFile() &&
        path.extname(file).toLowerCase() === ".csv"
      );
    });

    if (csvFiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No CSV file found.",
      });
    }

    // Download first CSV found
    const csvFile = csvFiles[0];
    const csvPath = path.join(csvFolder, csvFile);

    return res.download(csvPath, csvFile, (err) => {
      if (err) {
        console.error("CSV download failed:", err);

        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message: "Failed to download CSV.",
          });
        }
      }
    });
  } catch (error) {
    console.error("Error downloading CSV:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// const getCompletedBooklets = async (req, res) => {
//   const { id } = req.params;

//   try {
//     if (!isValidObjectId(id)) {
//       return res.status(400).json({ message: "Invalid task ID." });
//     }

//     const task = await Task.findById(id).populate("userId", "email");

//     if (!task) {
//       return res.status(404).json({ message: "Task not found" });
//     }

//     const booklets = await AnswerPdf.find({ taskId: task._id, status: true });

//     if (booklets.length === 0) {
//       return res.status(404).json({ message: "No completed booklets found" });
//     }

//     // Fetch all tasks for the subject and map user emails to taskIds
//     const tasks = await Task.find({ subjectCode: task.subjectCode }).populate(
//       "userId",
//       "email"
//     );
//     const taskUserMap = tasks.reduce((map, t) => {
//       if (t.userId && t.userId.email) {
//         map[t._id] = t.userId.email;
//       }
//       return map;
//     }, {});

//     // Construct results with evaluator details
//     const results = booklets.map((booklet) => ({
//       answerPdfId: booklet._id,
//       evaluatedBy: taskUserMap[booklet.taskId] || "Unknown",
//     }));

//     // Set up the response headers for streaming the ZIP file
//     res.setHeader("Content-Type", "application/zip");
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename=${task.subjectCode}_completedBooklets.zip`
//     );

//     // Create the ZIP archive and pipe it to the response
//     const archive = archiver("zip", { zlib: { level: 9 } });
//     archive.pipe(res);

//     // Process each booklet and add to the ZIP
//     for (const booklet of booklets) {
//       const bookletFolder = path.join(
//         __dirname,
//         `completedFolder/${task.subjectCode}/${booklet.answerPdfName}`
//       );

//       if (!fs.existsSync(bookletFolder)) {
//         return res.status(404).json({
//           message: `Folder not found for booklet: ${booklet.answerPdfName}`,
//         });
//       }

//       const images = fs
//         .readdirSync(bookletFolder)
//         .filter((file) => file.endsWith(".png"))
//         .sort((a, b) => {
//           const numA = parseInt(a.split("_")[1].split(".")[0], 10);
//           const numB = parseInt(b.split("_")[1].split(".")[0], 10);
//           return numA - numB;
//         });

//       if (images.length === 0) {
//         return res.status(404).json({
//           message: `No images found in folder for booklet: ${booklet.answerPdfName}`,
//         });
//       }

//       // Fetch marks data for this booklet for every question Id
//       const marksData = await Marks.find({ answerPdfId: booklet._id });
//       const questionDefinitions = await QuestionDefinition.find({
//         _id: { $in: marksData.map((m) => m.questionDefinitionId) },
//       });

//       // Generate the PDF for this booklet
//       const pdfBuffer = await generatePdfBuffer(
//         images,
//         bookletFolder,
//         booklet.answerPdfName,
//         results,
//         marksData,
//         questionDefinitions
//       );

//       // Add the PDF buffer to the ZIP archive
//       archive.append(pdfBuffer, { name: `${booklet.answerPdfName}.pdf` });
//     }

//     // Finalize the ZIP archive
//     await archive.finalize();
//   } catch (error) {
//     console.error("Error fetching completed booklets:", error);
//     res.status(500).json({
//       message: "Failed to fetch and process completed booklets.",
//       error: error.message,
//     });
//   }
// };

// Helper function to generate a PDF from images
// const generatePdfBuffer = async (
//   images,
//   bookletFolder,
//   bookletName,
//   results,
//   marksData,
//   questionDefinitions
// ) => {
//   return new Promise((resolve, reject) => {
//     const pdfBuffers = [];
//     const doc = new PDFDocument();

//     doc.on("data", (chunk) => pdfBuffers.push(chunk));
//     doc.on("end", () => resolve(Buffer.concat(pdfBuffers)));
//     doc.on("error", (err) => reject(err));

//     for (const image of images) {
//       const imagePath = path.join(bookletFolder, image);
//       doc.image(imagePath, 0, 0, {
//         fit: [doc.page.width, doc.page.height],
//       });
//       doc.addPage();
//     }

//     // Add the summary page
//     doc.addPage();

//     // Add booklet name at the top
//     doc.fontSize(18).text(`Booklet Name: ${bookletName || "N/A"}`, {
//       align: "center",
//       underline: true,
//     });

//     doc.moveDown(2);

//     const startX = 50;
//     const startY = doc.y;
//     const rowHeight = 25;
//     const columnWidths = [80, 80, 80, 150, 150];

//     const columns = [
//       { title: "Question", x: startX, width: columnWidths[0] },
//       { title: "Marks", x: startX + columnWidths[0], width: columnWidths[1] },
//       {
//         title: "Page No.",
//         x: startX + columnWidths[0] + columnWidths[1],
//         width: columnWidths[2],
//       },
//       {
//         title: "Time",
//         x: startX + columnWidths[0] + columnWidths[1] + columnWidths[2],
//         width: columnWidths[3],
//       },
//       {
//         title: "Evaluator",
//         x:
//           startX +
//           columnWidths[0] +
//           columnWidths[1] +
//           columnWidths[2] +
//           columnWidths[3],
//         width: columnWidths[4],
//       },
//     ];

//     // Add table headers
//     doc.fontSize(12).font("Helvetica-Bold");
//     for (const column of columns) {
//       doc.text(column.title, column.x, startY, {
//         width: column.width,
//         align: "left",
//       });
//     }
//     // Add rows from marks data
//     doc.fontSize(10).font("Helvetica");
//     marksData.forEach((mark, index) => {
//       const question = questionDefinitions.find(
//         (q) => q._id.toString() === mark.questionDefinitionId.toString()
//       );
//       const rowY = startY + (index + 1) * rowHeight;

//       doc.text(`Q${question?.questionsName}` || "N/A", columns[0].x, rowY, {
//         width: columns[0].width,
//         align: "left",
//       });
//       doc.text(mark.allottedMarks, columns[1].x, rowY, {
//         width: columns[1].width,
//         align: "left",
//       });
//       doc.text(index + 2, columns[2].x, rowY, {
//         width: columns[2].width,
//         align: "left",
//       });
//       doc.text(mark.timerStamps || "N/A", columns[3].x, rowY, {
//         width: columns[3].width,
//         align: "left",
//       });
//       doc.text(results[0]?.evaluatedBy || "N/A", columns[4].x, rowY, {
//         width: columns[4].width,
//         align: "left",
//       });
//     });

//     // Calculate Total Marks
//     const totalMarks = marksData.reduce(
//       (sum, mark) => sum + (Number(mark.allottedMarks) || 0),
//       0
//     );

//     // Print Total Marks at the bottom-right corner
//     const totalMarksText = `Total Marks: ${totalMarks}`;
//     const totalMarksX =
//       startX + columnWidths.reduce((sum, width) => sum + width, 0) - 200;
//     const totalMarksY = startY + (marksData.length + 1) * rowHeight + 20;

//     doc
//       .fontSize(12)
//       .font("Helvetica-Bold")
//       .text(totalMarksText, totalMarksX, totalMarksY, {
//         width: 150,
//         align: "right",
//       });

//     doc.end();
//   });
// };

// const generatePdfBuffer = async (images, bookletFolder, bookletName, results, marksData, questionDefinitions) => {
//     return new Promise((resolve, reject) => {
//         const pdfBuffers = [];
//         const doc = new PDFDocument();

//         doc.on("data", (chunk) => pdfBuffers.push(chunk));
//         doc.on("end", () => resolve(Buffer.concat(pdfBuffers)));
//         doc.on("error", (err) => reject(err));

//         // Add all images to the PDF
//         for (const image of images) {
//             const imagePath = path.join(bookletFolder, image);
//             doc.image(imagePath, 0, 0, {
//                 fit: [doc.page.width, doc.page.height],
//             });
//             doc.addPage();
//         }

//         // Add the summary page
//         doc.addPage();

//         // Add booklet name at the top
//         doc.fontSize(18).text(`Booklet Name: ${bookletName || "N/A"}`, {
//             align: "center",
//             underline: true,
//         });

//         doc.moveDown(2);

//         const startX = 50;
//         const startY = doc.y;
//         const rowHeight = 25;
//         const columnWidths = [80, 80, 150, 150]; // Removed the column for Page No.
//         // The column widths are adjusted accordingly

//         const columns = [
//             { title: "Question", x: startX, width: columnWidths[0] },
//             { title: "Marks", x: startX + columnWidths[0], width: columnWidths[1] },
//             // { title: "Page No.", x: startX + columnWidths[0] + columnWidths[1], width: columnWidths[2] }, // Removed Page No.
//             { title: "Time", x: startX + columnWidths[0] + columnWidths[1], width: columnWidths[2] },
//             { title: "Evaluator", x: startX + columnWidths[0] + columnWidths[1] + columnWidths[2], width: columnWidths[3] },
//         ];

//         // Add table headers
//         doc.fontSize(12).font("Helvetica-Bold");
//         for (const column of columns) {
//             doc.text(column.title, column.x, startY, { width: column.width, align: "left" });
//         }

//         // Add rows from marks data
//         doc.fontSize(10).font("Helvetica");
//         marksData.forEach((mark, index) => {
//             const question = questionDefinitions.find(q => q._id === mark.questionDefinitionId);
//             const rowY = startY + (index + 1) * rowHeight;

//             doc.text(question?.questionsName || `Q${index + 1}`, columns[0].x, rowY, { width: columns[0].width, align: "left" });
//             doc.text(mark.allottedMarks, columns[1].x, rowY, { width: columns[1].width, align: "left" });
//             // doc.text(index + 1, columns[2].x, rowY, { width: columns[2].width, align: "left" }); // Commented out Page No.
//             doc.text(mark.timerStamps || "N/A", columns[2].x, rowY, { width: columns[2].width, align: "left" });
//             doc.text(results[0]?.evaluatedBy || "N/A", columns[3].x, rowY, { width: columns[3].width, align: "left" });
//         });

//         // Calculate Total Marks
//         const totalMarks = marksData.reduce((sum, mark) => sum + (Number(mark.allottedMarks) || 0), 0);

//         // Print Total Marks at the bottom-right corner
//         const totalMarksText = `Total Marks: ${totalMarks}`;
//         const totalMarksX = startX + columnWidths.reduce((sum, width) => sum + width, 0) - 200;
//         const totalMarksY = startY + (marksData.length + 1) * rowHeight + 20;

//         doc.fontSize(12).font("Helvetica-Bold").text(totalMarksText, totalMarksX, totalMarksY, {
//             width: 150,
//             align: "right",
//         });

//         doc.end();
//     });
// };

export {
  generateResult,
  getPreviousResult,
  downloadResultByName,
  getCompletedBooklets,
  downloadCompletedBooklets,
  downloadSubjectCsv,
};
