import express from "express";
const router = express.Router();
import {
    processingBookletsBySocket,
    servingBooklets,
    uploadingBooklets,
    removeRejectedBooklets,
    deleteBookletsByRange,
    getAllBookletsName,
    processingBookletsManually,
    mobileUpload
} from "../../controllers/bookletsProcessing/bookletsProcessing.js";

import authMiddleware from "../../Middlewares/authMiddleware.js";
import uploadedMiddleware from "../../Middlewares/uploadedMiddleware.js";



router.post('/uploadingbooklets', authMiddleware, uploadedMiddleware.any(), uploadingBooklets);
router.post('/mobileupload', uploadedMiddleware.any(), mobileUpload);
router.post('/processing', processingBookletsBySocket);
router.get('/booklet', servingBooklets);
router.delete('/rejected', removeRejectedBooklets);
router.delete("/delete-booklets-range", deleteBookletsByRange);
router.get('/bookletname', getAllBookletsName);
router.post('/manually', processingBookletsManually);

export default router;

