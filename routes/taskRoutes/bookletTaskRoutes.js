import express from "express";
const router = express.Router();

import {
  assignBookletWiseTask,
  getBookletTaskById,
  completeBookletWise,
  rejectBookletWise,
  getBookletTasksByUser,     // ✅ NEW
  startBookletTask,          // ✅ NEW
} from "../../controllers/taskControllers/taskControllers.js"; 

router.post("/assign", assignBookletWiseTask);

router.get("/evaluator/:userId", getBookletTasksByUser);   // ✅ Dashboard API
router.put("/start/:taskId", startBookletTask);       // ✅ Start button API

router.get("/:id", getBookletTaskById);               // Load evaluation
router.put("/complete/:answerPdfId/:userId", completeBookletWise);
router.put("/reject/:answerPdfId", rejectBookletWise);

export default router;