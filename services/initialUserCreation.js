import User from "../models/authModels/User.js";
import bcrypt from "bcryptjs";

/* -------------------------------------------------------------------------- */
/*                           FUNCTION TO CREATE INITIAL USER                  */
/* -------------------------------------------------------------------------- */

async function createInitialUser() {
  try {
    const existingUser = await User.findOne({
      email: "abhishekomr077@gmail.com",
    });
    if (!existingUser) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("12345678", salt);
      const newUser = new User({
        name: "Abhishek Mishra",
        email: "abhishekomr077@gmail.com",
        password: hashedPassword,
        fingerprint:
          "Rk1SACAyMAAAAAFcAAABLAGQAMUAxQEAAABdNUDnAChoAEC9ACpsAECvADNzAECUADT7AEDFADvsAEDKAEvnAEDAAFJxAIBaAFuMAEECAF9fAEDBAGDqAEBVAGUKAEDeAGpoAIBRAG2OAECdAHJ7AED6AHVfAEBRAIeWAEAQAI2kAECNAJGDAEBBAJWdAEDRAJtoAEARAJ4fAECVAKiHAICrALV5AIEJALfRAEBoAManAEB1AMqoAECDAM+zAEEfANDNAIDHANnGAEEHAN3KAEBIAOW4AICxAO5QAEEkAPFNAIDOAPU4AEDmAPizAEBWAPzHAEEIAQK7AIDqAQiuAEDIAQuWAEA1ARXKAID3AR6vAECoAR54AIDMASKYAEBVASTbAICqATIGAEAmATTRAECUATdxAED7AT2nAECyAUOGAICMAUb5AEBkAVLoAEBrAV1oAECMAV5zAAAA",
        mobile: "8577887978",
        role: "admin",
        subjectCode: [],
        maxBooklets: 0,
        permissions: [
          "Dashboard",
          "Evaluator Dashboard",
          "Classes",
          "Courses",
          "Course Detail",
          "Profile",
          "Users",
          "Create User",
          "Upload CSV File",
          "Schema",
          "Create Schema",
          "Schema Structure",
          "Tasks",
          "Booklets",
          "Generate Result",
        ],
      });

      await newUser.save();
      console.log("Initial admin user created");
    } else {
      console.log("Admin user already exists");
    }
  } catch (error) {
    console.error("Error creating user:", error);
  }
}

export default createInitialUser;
