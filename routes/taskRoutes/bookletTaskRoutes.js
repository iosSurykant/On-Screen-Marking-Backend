import express from "express";
const router = express.Router();

import {
  assignBookletWiseTask,
  submitQABooklet,
  getQABookletTaskById,
  getQAAnswerPdfImages,
  getQATasksByUserId,
  assignQABookletTask,
  getAllQASubmissions,
  getBookletTaskById,
  completeBookletWise,
  rejectBookletWise,
  getBookletTasksByUser,     // ✅ NEW
  startBookletTask,          // ✅ NEW
} from "../../controllers/taskControllers/taskControllers.js"; 

router.post("/assign", assignBookletWiseTask);
router.post("/assign/qa", assignQABookletTask);
router.get("/qa/get-all/task/:userId", getQATasksByUserId);
router.get("/user/:id", getQABookletTaskById)
router.get("/qa/answer-pdf-images/:qaAnswerPdfId", getQAAnswerPdfImages); 
router.put("/submit/qa-booklet/:answerPdfId/:userId", submitQABooklet);
router.get("/admin/qa-submissions", getAllQASubmissions);

router.get("/evaluator/:userId", getBookletTasksByUser);   // ✅ Dashboard API
router.put("/start/:taskId", startBookletTask);       // ✅ Start button API

router.get("/:id", getBookletTaskById);               // Load evaluation
router.put("/complete/:answerPdfId/:userId", completeBookletWise);
router.put("/reject/:answerPdfId", rejectBookletWise);

export default router;