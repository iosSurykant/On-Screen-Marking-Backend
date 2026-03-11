import express from "express";
const router = express.Router();

import {
    assigningTask,
    reassignPendingBooklets,
    reassignBooklets,
    getUserCurrentTaskStatus,
   
    removeAssignedTask,
    getAssignTaskById,
    getAllAssignedTaskByUserId,
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
    getReassignedbooklets,
    createScannerTask,
    getAllScannerTasks,
    ChangeScannerTaskStatus,

    reviewerRejectTask,
    assignBookletWiseTask,
    getDataprincipalSide,
    assignReviewerRollbackTask
    // generatePdfForCompletedBooklet
} from "../../controllers/taskControllers/taskControllers.js";

import authMiddleware from "../../Middlewares/authMiddleware.js";

/* -------------------------------------------------------------------------- */
/*                           TASK ROUTES                                      */
/* -------------------------------------------------------------------------- */

router.post("/create/task", assigningTask);
router.post("/create/bookletwise/task", assignBookletWiseTask);
router.post("/create/scanner/task", createScannerTask);
router.post("/autoassign/task", autoAssigning);
router.post("/reassign/pending-booklets", reassignPendingBooklets);
router.get("/user/task-status/:userId", getUserCurrentTaskStatus);
router.post("/reassign/booklets", reassignBooklets);    
// router.get("/pause/task/:id", pauseTask);
// router.put("/update/task/:id", updateAssignedTask);
router.put("/edit/task/:taskId", editTaskHandler);
router.put("/update/task/currentIndex/:id", updateCurrentIndex);
router.delete("/remove/task/:id", removeAssignedTask);
router.get("/get/all/tasks", getAllTaskHandler);
router.get("/get/all/scannerTasks", getAllScannerTasks);
router.get("/get/reviewerTask/:id", getReviewerTask);
router.get("/get/reviewerBookletTask/:id", getReviewerBookletTask);
router.get("/get/task/:id", authMiddleware,  getAssignTaskById);
router.get("/get/questiondefinition", getQuestionDefinitionTaskId);
router.get("/getall/tasks/:userId", getAllAssignedTaskByUserId);
router.get("/subjectcode", getAllTasksBasedOnSubjectCode);
router.post("/rejectbooklet/:answerPdfId", rejectBooklet);
router.put("/completedbooklet/:answerpdfid/:userId", completedBookletHandler);

router.post("/reviewer/rejectTask", reviewerRejectTask);

router.get("/get/principalsideData", getDataprincipalSide);

router.post("/assign/reviewer-rollback", assignReviewerRollbackTask);

router.post("/change/scannerTaskStatus", ChangeScannerTaskStatus);

// router.post("/completeBooklet/generatePdf/:answerPdfId", generatePdfForCompletedBooklet);

router.put("/checktaskcompletion/:id", checkTaskCompletionHandler);

router.get('/getReassignedBooklets/:id', getReassignedbooklets);

export default router;

