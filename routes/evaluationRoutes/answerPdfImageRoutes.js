import express from "express";
const router = express.Router();
import {
    getAnswerPdfImages,
    updateQABookletAnswerPdfImageById,
    updateAnswerPdfImageById,
    savedAnswerImages,
    getBookletAnswerPdfImages,
    updateBookletAnswerPdfImageById
} from "../../controllers/evaluationControllers/answerPdfImageController.js";
import upload from "../../services/uploadFile.js";

import authMiddleware from "../../Middlewares/authMiddleware.js";

router.get("/getall/answerpdfimage/:answerPdfId", getAnswerPdfImages);
router.put("/update/answerpdfimage/:id", updateAnswerPdfImageById);

router.get("/getall/bookletanswerpdfimage/:bookletAnswerPdfId", getBookletAnswerPdfImages);
router.put("/update/bookletanswerpdfimage/:id", updateBookletAnswerPdfImageById);
router.put("/update/qa/bookletanswerpdfimage/:id", updateQABookletAnswerPdfImageById);

router.post("/api/saveimages", upload.single("image"), savedAnswerImages);

export default router;
 