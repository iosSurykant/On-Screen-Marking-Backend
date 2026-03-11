import mongoose from "mongoose";

const scannerTaskSchema = new mongoose.Schema({
    subjectCode: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    folderName: {
    type: String,
    required: true,
    unique: true
  },
  templateId: {
    type: Number,
    required: true
  },
    
    status: {
        type: String,
        required: true
    },
    
  
});

const ScannerTask = mongoose.model("ScannerTask", scannerTaskSchema);

export default ScannerTask;