import express from "express";
const router = express.Router();

import {
    getAllUserLoginLogs,
    getUserLoginAndAssignmentDetails,
    getUserEfficiency,
    getUserPassFailSummary,
    getUserAttendance,
    getQuestionAttemptAnalysis,
    getSubjectAverageMarks,
    getEvaluatorAverageMarks,
    downloadSingleUserDataCsv,
    getUserDataByDateRange,
    downloadUserDataByDateRangeCsv,
} from "../../controllers/misControllers/misControllers.js";
import authMiddleware from "../../Middlewares/authMiddleware.js";


router.get("/all-user/login-logs", authMiddleware, getAllUserLoginLogs);
router.get("/user-details/:userId", authMiddleware, getUserLoginAndAssignmentDetails);
router.get("/user-efficiency/:userId", authMiddleware, getUserEfficiency);
router.get("/users/:userId/pass-fail-summary", authMiddleware, getUserPassFailSummary);
router.get("/user-attendance/:userId", authMiddleware, getUserAttendance);
router.get("/question-attempt-analysis", authMiddleware, getQuestionAttemptAnalysis);
router.get("/subject-average-marks", authMiddleware,getSubjectAverageMarks);
router.get("/evaluator-average-marks/:userId", authMiddleware, getEvaluatorAverageMarks);
router.get("/download-user-data/:userId", authMiddleware, downloadSingleUserDataCsv);
router.get("/user-data/:userId/date-range", authMiddleware, getUserDataByDateRange);
router.get("/user-data/:userId/date-range/download",authMiddleware, downloadUserDataByDateRangeCsv,);

export default router;